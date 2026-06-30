// App state, as a small reactive store using Svelte 5 runes.
// One communicator, one board set, one sentence-in-progress — plus editing.

import type { Board, BoardSet, SpokenWord, Tile, TileAction } from './types';
import { seedBoardSet } from './seed';
import { speak } from './speech';
import { COLORS } from './palette';

const STORAGE_KEY = 'sayable.boardset.v1';

function uid(prefix = 't'): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return `${prefix}_${c.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function loadBoardSet(): BoardSet {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as BoardSet;
    } catch {
      // Corrupt or unreadable storage — fall back to the bundled starter set.
    }
  }
  return seedBoardSet();
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

const initialSet = loadBoardSet();
let boardSet = $state<BoardSet>(initialSet);
let currentBoardId = $state<string>(initialSet.homeId);
let utterance = $state<SpokenWord[]>([]);
let wordSeq = 0;

let editMode = $state(false);
let editorOpen = $state(false);
let editorIndex = $state<number | null>(null); // null => creating a new tile

export const app = {
  get boardSet(): BoardSet {
    return boardSet;
  },
  get board(): Board {
    return boardSet.boards[currentBoardId] ?? boardSet.boards[boardSet.homeId];
  },
  get utterance(): SpokenWord[] {
    return utterance;
  },
  get sentence(): string {
    return utterance.map((w) => w.text).join(' ');
  },
  get isHome(): boolean {
    return currentBoardId === boardSet.homeId;
  },

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

  // ----- talking -----
  tap(tile: Tile): void {
    if (tile.action.kind === 'goto') {
      this.openBoard(tile.action.boardId);
      return;
    }
    utterance = [...utterance, { id: `w${++wordSeq}`, text: tile.text, symbol: tile.symbol }];
    speak(tile.text);
  },
  openBoard(boardId: string): void {
    if (boardSet.boards[boardId]) currentBoardId = boardId;
  },
  goHome(): void {
    currentBoardId = boardSet.homeId;
  },
  speakAll(): void {
    speak(this.sentence);
  },
  backspace(): void {
    utterance = utterance.slice(0, -1);
  },
  clear(): void {
    utterance = [];
  },

  // ----- editing -----
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
    const id = uid('b');
    boardSet.boards[id] = {
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
          action: { kind: 'goto', boardId: boardSet.homeId },
        },
      ],
    };
    return id;
  },

  resetToDefaults(): void {
    boardSet = seedBoardSet();
    currentBoardId = boardSet.homeId;
    editMode = false;
    this.closeEditor();
    this.persist();
  },

  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(boardSet)));
    } catch {
      // Storage unavailable (private mode, quota) — edits still work this session.
    }
  },
};
