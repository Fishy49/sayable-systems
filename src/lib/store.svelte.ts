// App state, as a small reactive store using Svelte 5 runes.
// Top level is a set of Profiles (one per communicator); the active profile
// holds the boards. Plus a sentence-in-progress and editing state.

import type { AppData, Board, Profile, SpokenWord, Tile, TileAction, VoicePref } from './types';
import { seedBoards } from './seed';
import { speak } from './speech';
import { COLORS } from './palette';
import { idbGet, idbSet } from './idb';

const APP_KEY = 'sayable.app.v1';

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
    if (stored && stored.profiles?.length) return stored;
  } catch {
    // IndexedDB unavailable — start fresh (a failed save will surface loudly)
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

let editMode = $state(false);
let editorOpen = $state(false);
let editorIndex = $state<number | null>(null); // null => creating a new tile
let profilesOpen = $state(false);
let settingsOpen = $state(false);

async function boot(): Promise<void> {
  const loaded = await loadData();
  data = loaded;
  const active = loaded.profiles.find((p) => p.id === loaded.activeProfileId) ?? loaded.profiles[0];
  currentBoardId = active.homeId;
  ready = true;
  void requestPersistence();
  void checkStorage();
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
      this.openBoard(tile.action.boardId);
      return;
    }
    utterance = [...utterance, { id: `w${++wordSeq}`, text: tile.text, symbol: tile.symbol }];
    speak(tile.text, { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  openBoard(boardId: string): void {
    if (this.activeProfile.boards[boardId]) currentBoardId = boardId;
  },
  goHome(): void {
    currentBoardId = this.activeProfile.homeId;
  },
  speakAll(): void {
    speak(this.sentence, { voiceURI: this.voice.uri, rate: this.voice.rate });
  },
  backspace(): void {
    utterance = utterance.slice(0, -1);
  },
  clear(): void {
    utterance = [];
  },

  toggleEdit(): void {
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
    if (editorIndex === null) {
      this.board.tiles.push({ id: uid(), text, symbol: draft.symbol, bg: draft.bg, action });
    } else {
      const t = this.board.tiles[editorIndex];
      if (t) {
        t.text = text;
        t.symbol = draft.symbol;
        t.bg = draft.bg;
        t.action = action;
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
          symbol: '🔙',
          bg: COLORS.folder,
          action: { kind: 'goto', boardId: profile.homeId },
        },
      ],
    };
    return id;
  },

  resetToDefaults(): void {
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
    data.profiles.splice(idx, 1);
    if (data.activeProfileId === id) {
      data.activeProfileId = data.profiles[0].id;
      currentBoardId = this.activeProfile.homeId;
    }
    this.persist();
  },

  // ----- settings (per active profile) -----
  openSettings(): void {
    settingsOpen = true;
  },
  closeSettings(): void {
    settingsOpen = false;
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

  persist(): void {
    void writeData($state.snapshot(data));
  },
};
