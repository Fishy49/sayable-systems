// App state, as a small reactive store using Svelte 5 runes.
// Top level is a set of Profiles (one per communicator); the active profile
// holds the boards. Plus a sentence-in-progress and editing state.

import type { AppData, Board, Profile, SpokenWord, Tile, TileAction, VoicePref } from './types';
import { seedBoards } from './seed';
import { speak, speechHealthy, onSpeechHealthChange } from './speech';
import { COLORS } from './palette';
import { SYM, starterSymbol } from './symbolSet';
import { isImageSymbol } from './symbols';
import { idbGet, idbSet } from './idb';
import { logWord, logUtterance, logNav, collapseOldEvents, usageClear } from './usage';
import {
  takeSnapshot,
  currentSnapshot,
  collapseBackups,
  newestValidSnapshot,
  newestSnapshotRaw,
  getSnapshotData,
  isValidAppData,
  type SnapshotMeta,
} from './snapshots';

const APP_KEY = 'sayable.app.v1';
// Where a live record that failed validation is set aside. It is the only
// trace of the boards at that point, so it is kept, not overwritten.
const REJECTED_KEY = `${APP_KEY}.rejected`;
const REJECTED_BACKUP_KEY = `${APP_KEY}.rejected.backup`;

// What a tile actually says: its spoken override if set, else its displayed text.
function spokenText(t: { text: string; spoken?: string }): string {
  return t.spoken?.trim() || t.text;
}

function uid(prefix = 't'): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return `${prefix}_${c.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function makeProfile(name: string): Profile {
  const { homeId, boards } = seedBoards();
  return { id: uid('p'), name, homeId, boards };
}

function seedAppData(): AppData {
  const p = makeProfile('My boards');
  return { version: 1, activeProfileId: p.id, profiles: [p] };
}

// ---- durable storage: IndexedDB ----

// What loading found, beyond the data itself:
//   rejected   - a record was there and failed validation; it has been set aside
//   unreadable - storage could not be read at all; nothing may be written
type LoadTrouble = null | 'rejected' | 'unreadable';

async function loadData(): Promise<{ data: AppData; trouble: LoadTrouble }> {
  let stored: unknown;
  try {
    stored = await idbGet<unknown>(APP_KEY);
  } catch {
    // The boards may well be fine in there; this process just cannot see them.
    // Run on a starter set in memory and write nothing, so a reload can.
    return { data: seedAppData(), trouble: 'unreadable' };
  }
  if (isValidAppData(stored)) return { data: stored, trouble: null };

  // Main record missing or corrupt → self-heal from the newest good snapshot.
  try {
    const recovered = await newestValidSnapshot();
    if (recovered) {
      notice = `Recovered your boards from a backup (${new Date(recovered.ts).toLocaleString()}).`;
      await writeData(recovered.data); // repair the live record
      return { data: recovered.data, trouble: null };
    }
  } catch {
    // ignore and seed
  }

  // Nothing restorable. A missing record is a fresh install; a present one
  // that failed the check is somebody's vocabulary, and the starter set about
  // to be written would otherwise be the last anyone saw of it.
  const rejected = stored !== undefined;
  if (rejected) await stashRejected(stored);
  const seeded = seedAppData();
  await writeData(seeded);
  return { data: seeded, trouble: rejected ? 'rejected' : null };
}

async function stashRejected(record: unknown): Promise<void> {
  try {
    await idbSet(REJECTED_KEY, { ts: Date.now(), data: record });
    // The backup goes next: the seed's own backup will replace it.
    const backup = await newestSnapshotRaw();
    if (backup !== undefined) await idbSet(REJECTED_BACKUP_KEY, { ts: Date.now(), data: backup });
  } catch {
    // best effort; the notice still says what happened
  }
}

/**
 * One-time repairs for records written by earlier versions. Returns true when
 * anything changed, so the caller can persist once.
 */
function repairData(d: AppData): boolean {
  let changed = false;
  for (const p of d.profiles) {
    for (const b of Object.values(p.boards)) {
      for (const t of b.tiles) {
        // A picture-only tile used to get its image's data URL as its words,
        // which it then read aloud, byte by byte.
        if (t.text && isImageSymbol(t.text) && t.text === t.symbol) {
          t.text = '';
          changed = true;
        }
      }
    }
  }
  return changed;
}

async function writeData(snapshot: AppData): Promise<void> {
  try {
    await idbSet(APP_KEY, snapshot);
    saveError = false;
    void maybeAutoSnapshot(snapshot); // keeps the backup tracking real edits, not boots
  } catch {
    saveError = true; // storage blocked / out of room - surface it, never swallow it
  }
  void checkStorage();
}

async function requestPersistence(): Promise<void> {
  try {
    const s = navigator.storage;
    if (!s?.persist || !s?.persisted) return; // can't promise either way, so don't claim to
    const granted = (await s.persisted()) || (await s.persist());
    // Browsers hand out persistence on engagement signals, and a plain tab
    // often doesn't qualify - Chrome simply answers false. Without it the
    // boards are evictable whenever the device wants disk back, which for a
    // talker means losing their whole vocabulary. Asking and then ignoring a
    // "no" is the one thing we shouldn't do, so surface it instead.
    storageEvictable = !granted;
  } catch {
    // not supported - nothing to promise, and nothing useful to say
  }
}

async function checkStorage(): Promise<void> {
  try {
    const s = navigator.storage;
    if (!s?.estimate) return;
    const { usage, quota } = await s.estimate();
    storageWarning =
      usage && quota && usage / quota > 0.85
        ? 'Storage is almost full. Export a backup so nothing is lost.'
        : null;
  } catch {
    // ignore
  }
}

// What the tile editor hands back when you save.
export interface TileDraft {
  text: string;
  symbol: string;
  bg: string;
  actionKind: 'speak' | 'goto' | 'blank';
  gotoBoardId?: string; // an existing board id, or '__new__'
  newBoardName?: string;
  spoken?: string; // advanced: spoken override; blank means "same as text"
  hidden?: boolean; // masked out of the talking view
}

// A synchronous placeholder renders instantly; real data hydrates on boot.
const placeholder = seedAppData();
let data = $state<AppData>(placeholder);
let currentBoardId = $state<string>(placeholder.profiles[0].homeId);
let utterance = $state<SpokenWord[]>([]);
let wordSeq = 0;
// Keyboard-in-the-bar state. Both are session-only on purpose: a half-typed
// word is not something anyone wants restored on the next launch.
let typing = $state(false);
let draft = $state('');
// Which word in the sentence is armed for removal. Tapping a word arms it and
// shows its X; nothing is removable until then, so a stray tap on a board
// being used at speed cannot delete anything.
let selectedWordId = $state<string | null>(null);
let ready = $state(false);
let saveError = $state(false);
let storageWarning = $state<string | null>(null);
// A dismissable line of information: a recovery, an import that had to make do.
let notice = $state<string | null>(null);
// Something went wrong with storage at boot that the caregiver must know about.
let storageTrouble = $state<string | null>(null);
// Set when storage could not be read: writing anything would overwrite boards
// this process never saw.
let persistBlocked = false;
let storageEvictable = $state(false);
let storageRiskDismissed = $state(false);

// Speech that goes silent without erroring is invisible from inside the app,
// so the speech layer tells us and the caregiver gets told on screen.
let speechStalled = $state(!speechHealthy());
onSpeechHealthChange(() => {
  speechStalled = !speechHealthy();
});

let editMode = $state(false);
let editorOpen = $state(false);
let editorIndex = $state<number | null>(null); // null => creating a new tile
let profilesOpen = $state(false);
let settingsOpen = $state(false);
let voicePickerOpen = $state(false);

// "Show every word" - a temporary override of tile masking, for free play or a
// therapy session. Deliberately session-only (never persisted): if the tablet
// reloads or gets handed back, masking comes back on its own.
let revealAll = $state(false);
let reportOpen = $state(false);

// ---- caregiver lock ----
// The PIN gates the caregiver surface (edit / settings / profiles). Unlock
// lasts for the session only — a reload or the topbar lock button re-arms it.
export type PendingLockAction = 'settings' | 'profiles' | 'edit';
let unlockedThisSession = $state(false);
let pinPromptOpen = $state(false);
let pinSetupOpen = $state(false);
let pendingAction: PendingLockAction | null = null;

// A child lock, not cryptography: hashing just keeps the PIN from sitting in
// IndexedDB as plain text. crypto.subtle needs a secure context (https or
// localhost); anywhere else, fall back to a marked plain value.
async function hashPin(pin: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sayable:${pin}`));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `plain:${pin}`;
  }
}

const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
// Mirrors the backup's timestamp so the common case (a save, minutes after the
// last one) is answered without opening IndexedDB.
let lastBackupTs = 0;

/**
 * Refresh the backup if it has aged out, at most once an hour.
 *
 * Driven by saves rather than by a timer: a tablet left running for days makes
 * no new work to protect while nobody touches it, and this used to run only at
 * boot, which on a kiosk that never reloads meant never again.
 */
let autoSnapshotInFlight: Promise<void> | null = null;
function maybeAutoSnapshot(snapshot: AppData): Promise<void> {
  // Saves can arrive faster than a backup is written. Later calls join the one
  // in flight rather than each concluding the backup is stale and writing
  // their own; the next hour's backup picks up whatever they carried.
  if (autoSnapshotInFlight) return autoSnapshotInFlight;
  autoSnapshotInFlight = autoSnapshotNow(snapshot).finally(() => {
    autoSnapshotInFlight = null;
  });
  return autoSnapshotInFlight;
}

async function autoSnapshotNow(snapshot: AppData): Promise<void> {
  try {
    if (Date.now() - lastBackupTs < BACKUP_INTERVAL_MS) return;
    const current = await currentSnapshot();
    if (current && Date.now() - current.ts < BACKUP_INTERVAL_MS) {
      lastBackupTs = current.ts; // includes the "Before ..." copies, so an undo survives its hour
      return;
    }
    await takeSnapshot(snapshot, 'Automatic');
    lastBackupTs = Date.now();
  } catch {
    // backups are best-effort
  }
}

async function boot(): Promise<void> {
  const { data: loaded, trouble } = await loadData();
  if (trouble === 'unreadable') {
    persistBlocked = true;
    storageTrouble =
      'Sayable couldn\u2019t read its saved boards, so a starter set is showing. Nothing will be saved ' +
      'until the app is closed and reopened, so your boards stay as they were.';
  } else if (trouble === 'rejected') {
    storageTrouble =
      'The saved boards couldn\u2019t be read, so a starter set is loaded. The unreadable copy has been ' +
      'set aside on this device, not deleted.';
  } else if (repairData(loaded)) {
    void writeData(loaded);
  }
  data = loaded;
  const active = loaded.profiles.find((p) => p.id === loaded.activeProfileId) ?? loaded.profiles[0];
  currentBoardId = active.homeId;
  ready = true;
  void requestPersistence();
  void checkStorage();
  // Fold any leftover rolling history first, so the age check below reads the
  // copy we are actually keeping.
  void collapseBackups()
    .catch(() => {})
    .then(() => maybeAutoSnapshot(loaded));
  void collapseOldEvents(); // fold any usage rows that have aged out of the window
}
void boot();

export const app = {
  // ----- storage status -----
  get ready(): boolean {
    return ready;
  },
  get saveError(): boolean {
    return saveError;
  },
  get storageWarning(): string | null {
    return storageWarning;
  },
  get notice(): string | null {
    return notice;
  },
  showNotice(text: string): void {
    notice = text;
  },
  dismissNotice(): void {
    notice = null;
  },
  get storageTrouble(): string | null {
    return storageTrouble;
  },
  /** True when nothing can be saved this session (storage was unreadable at boot). */
  get persistBlocked(): boolean {
    return persistBlocked;
  },
  dismissStorageTrouble(): void {
    storageTrouble = null;
  },
  /** The browser declined to make this profile's storage permanent. */
  get storageAtRisk(): boolean {
    return storageEvictable && !storageRiskDismissed;
  },
  dismissStorageRisk(): void {
    storageRiskDismissed = true;
  },
  /** An utterance was swallowed with no error - speech has gone quiet. */
  get speechStalled(): boolean {
    return speechStalled;
  },

  // ----- profiles -----
  get profiles(): Profile[] {
    return data.profiles;
  },
  get activeProfile(): Profile {
    return data.profiles.find((p) => p.id === data.activeProfileId) ?? data.profiles[0];
  },
  get profilesOpen(): boolean {
    return profilesOpen;
  },
  get settingsOpen(): boolean {
    return settingsOpen;
  },
  get voicePickerOpen(): boolean {
    return voicePickerOpen;
  },
  get voice(): VoicePref {
    return this.activeProfile.voice ?? {};
  },
  get categoryShapes(): boolean {
    return this.activeProfile.showShapes !== false;
  },

  // ----- boards -----
  get board(): Board {
    const p = this.activeProfile;
    return p.boards[currentBoardId] ?? p.boards[p.homeId];
  },
  get isHome(): boolean {
    return currentBoardId === this.activeProfile.homeId;
  },

  // ----- talking -----
  get utterance(): SpokenWord[] {
    return utterance;
  },
  get sentence(): string {
    return utterance.map((w) => w.text).join(' ');
  },
  /** Whether this communicator's bar offers a keyboard at all. */
  get canType(): boolean {
    return this.activeProfile.allowTyping !== false;
  },
  /** Whether the keyboard row is currently showing. */
  get typing(): boolean {
    return typing && this.canType;
  },
  get draft(): string {
    return draft;
  },
  get selectedWordId(): string | null {
    return selectedWordId;
  },

  // ----- editing -----
  get editMode(): boolean {
    return editMode;
  },
  get editorOpen(): boolean {
    return editorOpen;
  },
  get editorIsNew(): boolean {
    return editorIndex === null;
  },
  get editorTile(): Tile | null {
    return editorIndex === null ? null : (this.board.tiles[editorIndex] ?? null);
  },

  tap(tile: Tile): void {
    if (tile.action.kind === 'blank') return; // a deliberate gap does nothing
    if (tile.action.kind === 'goto') {
      const dest = this.activeProfile.boards[tile.action.boardId];
      if (this.logging) logNav(this.activeProfile.id, dest?.name ?? tile.text);
      this.openBoard(tile.action.boardId);
      return;
    }
    utterance = [
      ...utterance,
      { id: `w${++wordSeq}`, text: tile.text, symbol: tile.symbol, spoken: tile.spoken },
    ];
    selectedWordId = null;
    if (this.logging) logWord(this.activeProfile.id, tile.text);
    speak(spokenText(tile), { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  openBoard(boardId: string): void {
    if (this.activeProfile.boards[boardId]) currentBoardId = boardId;
  },
  goHome(): void {
    currentBoardId = this.activeProfile.homeId;
  },
  speakAll(): void {
    // Read back using each word's spoken override, so a tile sounds the same
    // in a sentence as it does tapped alone.
    selectedWordId = null;
    const phrase = utterance.map(spokenText).join(' ');
    // A played-back sentence is the unit MLU is measured in, so log the count
    // of tiles chosen rather than the words in the spoken string.
    if (this.logging && utterance.length > 0) {
      logUtterance(this.activeProfile.id, this.sentence, utterance.length);
    }
    speak(phrase, { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  backspace(): void {
    utterance = utterance.slice(0, -1);
    selectedWordId = null;
  },
  clear(): void {
    utterance = [];
    draft = '';
    selectedWordId = null;
  },

  /**
   * Tap a word already in the sentence: say that one word and arm it, so its
   * X appears. Tapping the armed word again puts the X away.
   */
  tapWord(id: string): void {
    if (selectedWordId === id) {
      selectedWordId = null;
      return;
    }
    selectedWordId = id;
    const word = utterance.find((w) => w.id === id);
    if (word) speak(spokenText(word), { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  removeWord(id: string): void {
    utterance = utterance.filter((w) => w.id !== id);
    selectedWordId = null;
  },

  // ----- typing -----
  // Typed words join the sentence as chips, exactly like tapped tiles, so one
  // sentence can mix both and read back as a single phrase.
  setDraft(text: string): void {
    draft = text;
  },
  setTyping(on: boolean): void {
    typing = on;
    if (!on) draft = '';
  },
  toggleTyping(): void {
    this.setTyping(!typing);
  },
  /**
   * Turn the draft into a word in the sentence and say it. Keeps typing mode
   * open so the next word can follow without another tap.
   */
  commitDraft(): void {
    const text = draft.trim().replace(/\s+/g, ' ');
    draft = '';
    if (!text) return;
    utterance = [...utterance, { id: `w${++wordSeq}`, text, symbol: '' }];
    selectedWordId = null;
    if (this.logging) {
      // Log each real word, not the phrase as one entry, so the vocabulary
      // in the usage report stays comparable with tapped words.
      for (const w of text.split(' ')) logWord(this.activeProfile.id, w);
    }
    speak(text, { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  setAllowTyping(on: boolean): void {
    this.activeProfile.allowTyping = on;
    if (!on) this.setTyping(false);
    this.persist();
  },

  toggleEdit(): void {
    if (this.locked) {
      this.requestUnlock('edit');
      return;
    }
    editMode = !editMode;
    if (!editMode) this.closeEditor();
  },
  openEditor(index: number | null): void {
    editorIndex = index;
    editorOpen = true;
  },
  closeEditor(): void {
    editorOpen = false;
  },

  // ----- tile masking (progressive vocabulary reveal) -----
  get revealAll(): boolean {
    return revealAll;
  },
  setRevealAll(on: boolean): void {
    revealAll = on;
  },
  /** Is this tile shown to the communicator right now? */
  tileShown(tile: Tile): boolean {
    // A blank renders as the same empty slot a masked word does, but it is not
    // a masked word: "Show every word" must never fill in an authored gap.
    if (tile.action.kind === 'blank') return false;
    return !tile.hidden || revealAll;
  },
  /** Masked tiles on the board being viewed. */
  get boardHiddenCount(): number {
    return this.board.tiles.filter((t) => t.hidden).length;
  },
  /** Masked tiles across every board in the active profile. */
  get profileHiddenCount(): number {
    return Object.values(this.activeProfile.boards).reduce(
      (n, b) => n + b.tiles.filter((t) => t.hidden).length,
      0,
    );
  },
  toggleTileHidden(index: number): void {
    const t = this.board.tiles[index];
    if (!t) return;
    // Store nothing for the common case, so a visible tile stays a clean record.
    if (t.hidden) delete t.hidden;
    else t.hidden = true;
    this.persist();
  },
  /** Mask or unmask every tile on the board being viewed. */
  setBoardHidden(hidden: boolean): void {
    for (const t of this.board.tiles) {
      if (t.action.kind === 'blank') continue; // there is no word here to mask
      if (hidden) t.hidden = true;
      else delete t.hidden;
    }
    this.persist();
  },

  moveTile(from: number, to: number): void {
    const tiles = this.board.tiles;
    if (from === to || from < 0 || to < 0 || from >= tiles.length || to >= tiles.length) return;
    const [moved] = tiles.splice(from, 1);
    tiles.splice(to, 0, moved);
    // Persisted by the caller when the drag gesture ends.
  },

  commitTile(draft: TileDraft): void {
    let action: TileAction;
    if (draft.actionKind === 'blank') {
      action = { kind: 'blank' };
    } else if (draft.actionKind === 'goto') {
      let boardId = draft.gotoBoardId;
      if (!boardId || boardId === '__new__') {
        boardId = this.addBoard((draft.newBoardName || draft.text || 'New board').trim());
      }
      action = { kind: 'goto', boardId };
    } else {
      action = { kind: 'speak' };
    }

    // A gap carries no word, picture, or masking - clearing them here keeps a
    // tile that was turned into a blank from hoarding its old contents.
    const blank = action.kind === 'blank';
    // An emoji can stand in for the words; an image's data URL cannot.
    const text = blank ? '' : draft.text.trim() || (isImageSymbol(draft.symbol) ? '' : draft.symbol);
    const spoken = blank ? undefined : draft.spoken?.trim() || undefined; // nothing when it matches the label
    const hidden = blank ? undefined : draft.hidden || undefined; // omit the field entirely when visible
    const symbol = blank ? '' : draft.symbol;
    if (editorIndex === null) {
      this.board.tiles.push({ id: uid(), text, symbol, bg: draft.bg, action, spoken, hidden });
    } else {
      const t = this.board.tiles[editorIndex];
      if (t) {
        t.text = text;
        t.symbol = symbol;
        t.bg = draft.bg;
        t.action = action;
        t.spoken = spoken;
        if (hidden) t.hidden = true;
        else delete t.hidden;
      }
    }
    this.persist();
    this.closeEditor();
  },

  removeEditingTile(): void {
    if (editorIndex !== null) {
      this.board.tiles.splice(editorIndex, 1);
      this.persist();
    }
    this.closeEditor();
  },

  addBoard(name: string): string {
    const profile = this.activeProfile;
    const id = uid('b');
    profile.boards[id] = {
      id,
      name: name || 'New board',
      rows: 3,
      cols: 5,
      tiles: [
        {
          id: uid(),
          text: 'Back',
          symbol: SYM['Back'] ?? '🔙',
          bg: COLORS.folder,
          action: { kind: 'goto', boardId: profile.homeId },
        },
      ],
    };
    return id;
  },

  /**
   * Remove a board. Tiles that opened it keep their cell as a gap, so nothing
   * around them moves. The home board cannot be removed.
   */
  deleteBoard(boardId: string): void {
    const p = this.activeProfile;
    const board = p.boards[boardId];
    if (!board || boardId === p.homeId) return;
    void takeSnapshot($state.snapshot(data), `Before deleting ${board.name}`);
    delete p.boards[boardId];
    for (const b of Object.values(p.boards)) {
      for (const t of b.tiles) {
        if (t.action.kind === 'goto' && t.action.boardId === boardId) {
          t.action = { kind: 'blank' };
          t.text = '';
          t.symbol = '';
          delete t.spoken;
          delete t.hidden;
        }
      }
    }
    if (currentBoardId === boardId) currentBoardId = p.homeId;
    this.closeEditor();
    this.persist();
  },
  /** Boards no tile can reach from home: leftovers from deleted folder tiles. */
  get unreachableBoardIds(): string[] {
    const p = this.activeProfile;
    const seen = new Set<string>([p.homeId]);
    const queue = [p.homeId];
    while (queue.length) {
      const b = p.boards[queue.shift()!];
      if (!b) continue;
      for (const t of b.tiles) {
        if (t.action.kind === 'goto' && p.boards[t.action.boardId] && !seen.has(t.action.boardId)) {
          seen.add(t.action.boardId);
          queue.push(t.action.boardId);
        }
      }
    }
    return Object.keys(p.boards).filter((id) => !seen.has(id));
  },
  removeUnreachableBoards(): number {
    const ids = this.unreachableBoardIds;
    if (!ids.length) return 0;
    void takeSnapshot($state.snapshot(data), 'Before removing unused boards');
    const p = this.activeProfile;
    for (const id of ids) delete p.boards[id];
    if (!p.boards[currentBoardId]) currentBoardId = p.homeId;
    this.persist();
    return ids.length;
  },

  resetToDefaults(): void {
    void takeSnapshot($state.snapshot(data), 'Before reset');
    const fresh = seedBoards();
    const p = this.activeProfile;
    p.homeId = fresh.homeId;
    p.boards = fresh.boards;
    currentBoardId = fresh.homeId;
    editMode = false;
    this.closeEditor();
    this.persist();
  },

  // ----- profile switcher -----
  openProfiles(): void {
    if (this.locked) {
      this.requestUnlock('profiles');
      return;
    }
    profilesOpen = true;
  },
  closeProfiles(): void {
    profilesOpen = false;
  },
  switchProfile(id: string): void {
    if (!data.profiles.some((p) => p.id === id)) return;
    data.activeProfileId = id;
    currentBoardId = this.activeProfile.homeId;
    utterance = []; // the sentence belongs to whoever was building it
    selectedWordId = null;
    editMode = false;
    revealAll = false; // each communicator gets their own masking back
    this.setTyping(false); // whether the bar has a keyboard is per communicator
    this.closeEditor();
    this.closeProfiles();
    this.persist();
  },
  addProfile(name: string): string {
    const p = makeProfile((name || '').trim() || `Profile ${data.profiles.length + 1}`);
    data.profiles.push(p);
    this.persist();
    return p.id;
  },
  importProfile(profile: Profile): string {
    // Fresh id so it never collides; repair homeId if it points nowhere.
    const homeId = profile.boards[profile.homeId] ? profile.homeId : Object.keys(profile.boards)[0];
    const fresh: Profile = { ...profile, id: uid('p'), homeId };
    data.profiles.push(fresh);
    this.switchProfile(fresh.id); // land in it (also persists + closes the modal)
    return fresh.id;
  },
  renameProfile(id: string, name: string): void {
    const p = data.profiles.find((x) => x.id === id);
    if (p) {
      p.name = (name || '').trim() || p.name;
      this.persist();
    }
  },
  deleteProfile(id: string): void {
    if (data.profiles.length <= 1) return; // always keep at least one
    const idx = data.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return;
    void takeSnapshot($state.snapshot(data), `Before deleting ${data.profiles[idx].name}`);
    data.profiles.splice(idx, 1);
    if (data.activeProfileId === id) {
      data.activeProfileId = data.profiles[0].id;
      currentBoardId = this.activeProfile.homeId;
    }
    this.persist();
  },

  // ----- settings (per active profile) -----
  openSettings(): void {
    if (this.locked) {
      this.requestUnlock('settings');
      return;
    }
    settingsOpen = true;
  },
  closeSettings(): void {
    settingsOpen = false;
    voicePickerOpen = false;
    reportOpen = false;
  },
  openVoicePicker(): void {
    voicePickerOpen = true;
  },
  closeVoicePicker(): void {
    voicePickerOpen = false;
  },
  setVoiceURI(uri: string | null): void {
    const p = this.activeProfile;
    p.voice = { ...(p.voice ?? {}), uri: uri ?? undefined };
    this.persist();
  },
  setVoiceRate(rate: number): void {
    const p = this.activeProfile;
    p.voice = { ...(p.voice ?? {}), rate };
    this.persist();
  },
  setShowShapes(on: boolean): void {
    this.activeProfile.showShapes = on;
    this.persist();
  },

  // ----- usage logging (opt-in, on-device only) -----
  get logging(): boolean {
    return data.logUsage === true; // off unless explicitly turned on
  },
  get reportOpen(): boolean {
    return reportOpen;
  },
  openReport(): void {
    reportOpen = true;
  },
  closeReport(): void {
    reportOpen = false;
  },
  setLogging(on: boolean): void {
    if (on) data.logUsage = true;
    else delete data.logUsage;
    this.persist();
  },
  /** Erase every logged row. Deliberately does not touch the opt-in itself. */
  async clearUsage(): Promise<void> {
    await usageClear();
  },

  // ----- backup (one local copy) -----
  async currentBackup(): Promise<SnapshotMeta | null> {
    return currentSnapshot();
  },
  async restoreBackup(id: number): Promise<void> {
    // Read the copy out first: saving the current boards below replaces it.
    const restored = await getSnapshotData(id);
    if (!restored) return;
    await takeSnapshot($state.snapshot(data), 'Before restore'); // make the restore itself undoable
    data = restored;
    const active = restored.profiles.find((p) => p.id === restored.activeProfileId) ?? restored.profiles[0];
    currentBoardId = active.homeId;
    editMode = false;
    this.closeEditor();
    this.closeSettings();
    this.persist();
  },

  // ----- caregiver lock -----
  get lockEnabled(): boolean {
    return !!data.lockPin;
  },
  get locked(): boolean {
    return !!data.lockPin && !unlockedThisSession;
  },
  get pinPromptOpen(): boolean {
    return pinPromptOpen;
  },
  get pinSetupOpen(): boolean {
    return pinSetupOpen;
  },
  requestUnlock(action: PendingLockAction): void {
    pendingAction = action;
    pinPromptOpen = true;
  },
  cancelPin(): void {
    pinPromptOpen = false;
    pinSetupOpen = false;
    pendingAction = null;
  },
  async tryUnlock(pin: string): Promise<boolean> {
    const stored = data.lockPin;
    if (!stored) return false;
    const hashed = await hashPin(pin);
    // A PIN set where hashing was unavailable is stored as marked plain text.
    // Accept it, and upgrade it now that hashing works here.
    if (hashed !== stored && `plain:${pin}` !== stored) return false;
    if (hashed !== stored && !hashed.startsWith('plain:')) {
      data.lockPin = hashed;
      this.persist();
    }
    unlockedThisSession = true;
    pinPromptOpen = false;
    const action = pendingAction;
    pendingAction = null;
    // Continue to wherever the caregiver was headed when the PIN pad appeared.
    if (action === 'settings') this.openSettings();
    else if (action === 'profiles') this.openProfiles();
    else if (action === 'edit') this.toggleEdit();
    return true;
  },
  openPinSetup(): void {
    pinSetupOpen = true;
  },
  async setPin(pin: string): Promise<void> {
    data.lockPin = await hashPin(pin);
    unlockedThisSession = true; // never lock out the person who just set it
    pinSetupOpen = false;
    this.persist();
  },
  removePin(): void {
    delete data.lockPin;
    unlockedThisSession = false;
    this.persist();
  },
  /** The forgotten-PIN path: take the lock off from the PIN pad itself. */
  forgetPin(): void {
    this.removePin();
    pinPromptOpen = false;
    pendingAction = null;
  },
  relock(): void {
    unlockedThisSession = false;
    // Hand-back safety: leave no caregiver surface open behind the lock, and
    // put masking back on, so "show all words" can't outlive the grown-up.
    editMode = false;
    revealAll = false;
    this.closeEditor();
    this.closeSettings();
    this.closeProfiles();
  },

  persist(): void {
    if (persistBlocked) return; // storage was unreadable at boot; see storageTrouble
    void writeData($state.snapshot(data));
  },
};
