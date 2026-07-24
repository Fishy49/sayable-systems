// App state, as a small reactive store using Svelte 5 runes.
// Top level is a set of Profiles (one per communicator); the active profile
// holds the boards. Plus a sentence-in-progress and editing state.

import type { AppData, Board, Profile, SpokenWord, Tile, TileAction, VoicePref } from './types';
import { seedBoards } from './seed';
import { speak } from './speech';
import { COLORS } from './palette';
import { SYM, starterSymbol } from './symbolSet';
import { idbGet, idbSet } from './idb';
import { logWord, logUtterance, logNav, collapseOldEvents, usageClear } from './usage';
import {
  takeSnapshot,
  listSnapshots,
  newestValidSnapshot,
  getSnapshotData,
  deleteSnapshot,
  isValidAppData,
  type SnapshotMeta,
} from './snapshots';

const APP_KEY = 'sayable.app.v1';

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

async function loadData(): Promise<AppData> {
  try {
    const stored = await idbGet<AppData>(APP_KEY);
    if (isValidAppData(stored)) return stored;
  } catch {
    // fall through to snapshot recovery
  }
  // Main record missing or corrupt → self-heal from the newest good snapshot.
  try {
    const recovered = await newestValidSnapshot();
    if (recovered) {
      recoveryNotice = `Recovered your boards from a backup (${new Date(recovered.ts).toLocaleString()}).`;
      await writeData(recovered.data); // repair the live record
      return recovered.data;
    }
  } catch {
    // ignore and seed
  }
  const seeded = seedAppData();
  await writeData(seeded);
  return seeded;
}

async function writeData(snapshot: AppData): Promise<void> {
  try {
    await idbSet(APP_KEY, snapshot);
    saveError = false;
  } catch {
    saveError = true; // storage blocked / out of room — surface it, never swallow it
  }
  void checkStorage();
}

async function requestPersistence(): Promise<void> {
  try {
    const s = navigator.storage;
    if (s?.persist && s?.persisted && !(await s.persisted())) await s.persist();
  } catch {
    // not supported — nothing to do
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
  actionKind: 'speak' | 'goto';
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
let ready = $state(false);
let saveError = $state(false);
let storageWarning = $state<string | null>(null);
let recoveryNotice = $state<string | null>(null);

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

async function maybeAutoSnapshot(): Promise<void> {
  try {
    const list = await listSnapshots();
    const hour = 60 * 60 * 1000;
    if (!list.length || Date.now() - list[0].ts > hour) {
      await takeSnapshot($state.snapshot(data), 'Automatic');
    }
  } catch {
    // snapshots are best-effort
  }
}

async function boot(): Promise<void> {
  const loaded = await loadData();
  data = loaded;
  const active = loaded.profiles.find((p) => p.id === loaded.activeProfileId) ?? loaded.profiles[0];
  currentBoardId = active.homeId;
  ready = true;
  void requestPersistence();
  void checkStorage();
  void maybeAutoSnapshot();
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
  get recoveryNotice(): string | null {
    return recoveryNotice;
  },
  dismissRecovery(): void {
    recoveryNotice = null;
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
  },
  clear(): void {
    utterance = [];
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
    if (draft.actionKind === 'goto') {
      let boardId = draft.gotoBoardId;
      if (!boardId || boardId === '__new__') {
        boardId = this.addBoard((draft.newBoardName || draft.text || 'New board').trim());
      }
      action = { kind: 'goto', boardId };
    } else {
      action = { kind: 'speak' };
    }

    const text = draft.text.trim() || draft.symbol;
    const spoken = draft.spoken?.trim() || undefined; // store nothing when it matches the label
    const hidden = draft.hidden || undefined; // omit the field entirely when visible
    if (editorIndex === null) {
      this.board.tiles.push({
        id: uid(),
        text,
        symbol: draft.symbol,
        bg: draft.bg,
        action,
        spoken,
        hidden,
      });
    } else {
      const t = this.board.tiles[editorIndex];
      if (t) {
        t.text = text;
        t.symbol = draft.symbol;
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
    editMode = false;
    revealAll = false; // each communicator gets their own masking back
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

  // ----- backups (local snapshots) -----
  async listBackups(): Promise<SnapshotMeta[]> {
    return listSnapshots();
  },
  async restoreBackup(id: number): Promise<void> {
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
  async deleteBackup(id: number): Promise<void> {
    await deleteSnapshot(id);
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
    if (!data.lockPin || (await hashPin(pin)) !== data.lockPin) return false;
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
    void writeData($state.snapshot(data));
  },
};
