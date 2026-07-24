// Open Board Format (OBF / OBZ) import & export.
//
// OBF (https://www.openboardformat.org/) is the vendor-neutral interchange
// format for AAC boards. A `.obf` is one board as JSON; a `.obz` is a ZIP of a
// whole board set (manifest.json + boards/*.obf, images inlined as data URIs).
//
// Mapping to Sayable's model:
//   Sayable board  <-> OBF board (grid.rows/columns/order preserves positions)
//   Sayable tile   <-> OBF button (label, vocalization=spoken override,
//                       load_board=folder navigation, background_color)
//   emoji symbol   <-> button.ext_sayable_symbol (round-trips; other tools
//                       show the label). Image symbols map to OBF images[].

import type { Board, Profile, Tile, TileAction } from './types';
import { isValidProfile } from './snapshots';
import { isImageSymbol } from './symbols';
import { zip, unzip, type ZipEntry } from './zip';

export const OBF_FORMAT = 'open-board-0.1';

function rid(prefix: string): string {
  const c = globalThis.crypto;
  const r = c && 'randomUUID' in c ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${r}`;
}

// ---- colors: Sayable stores hex; OBF uses CSS rgb()/rgba() strings ----

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex2(n: number): string {
  return clamp(n).toString(16).padStart(2, '0');
}

function darken(hex: string, factor = 0.82): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return `rgb(${clamp(((n >> 16) & 255) * factor)}, ${clamp(((n >> 8) & 255) * factor)}, ${clamp((n & 255) * factor)})`;
}

/** Parse an OBF color (rgb/rgba/#hex/#rgb) back to Sayable's `#rrggbb`. */
function colorToHex(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    if (h.length === 3) return '#' + h.split('').map((x) => x + x).join('').toLowerCase();
    if (h.length === 6) return '#' + h.toLowerCase();
    return fallback;
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c);
  if (m) return '#' + toHex2(+m[1]) + toHex2(+m[2]) + toHex2(+m[3]);
  return fallback;
}

// ---- data-URI / base64 helpers ----

function contentTypeOf(dataUri: string): string {
  return /^data:([^;,]+)/.exec(dataUri)?.[1] ?? 'image/png';
}

function u8ToBase64(u8: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}

const DEFAULT_GOTO_BG = '#d7dbe0'; // folder grey
const DEFAULT_SPEAK_BG = '#dbe4f0';

// ---- OBF shape (only the fields we read/write) ----

interface ObfImage {
  id: string;
  data?: string; // full data URI
  url?: string;
  path?: string; // for .obz: a file within the zip
  content_type?: string;
}
interface ObfButton {
  id: string;
  label?: string;
  vocalization?: string;
  image_id?: string;
  background_color?: string;
  border_color?: string;
  load_board?: { id?: string; name?: string; path?: string };
  hidden?: boolean; // standard OBF field, so masking survives a trip through other tools
  // OBF's specialty buttons (":clear", ":backspace", ":home", ":space", ...).
  // Sayable puts those controls in the sentence bar rather than on the board.
  action?: string;
  actions?: string[];
  ext_sayable_symbol?: string;
}
interface ObfBoard {
  format: string;
  id: string;
  locale?: string;
  name?: string;
  buttons?: ObfButton[];
  images?: ObfImage[];
  grid?: { rows: number; columns: number; order: (string | null)[][] };
  ext_sayable_profile_name?: string;
}

// ================= EXPORT =================

function gridRows(board: Board): number {
  return Math.max(board.rows, Math.ceil(board.tiles.length / Math.max(1, board.cols)));
}

function tileToButton(tile: Tile, images: ObfImage[]): ObfButton {
  const btn: ObfButton = {
    id: tile.id,
    label: tile.text,
    background_color: hexToRgb(tile.bg),
    border_color: darken(tile.bg),
  };
  if (tile.spoken && tile.spoken.trim() && tile.spoken !== tile.text) btn.vocalization = tile.spoken;
  if (tile.hidden) btn.hidden = true;
  if (tile.action.kind === 'goto') {
    btn.load_board = { id: tile.action.boardId, path: `boards/${tile.action.boardId}.obf` };
  }
  if (isImageSymbol(tile.symbol)) {
    const imgId = rid('img');
    images.push({ id: imgId, data: tile.symbol, content_type: contentTypeOf(tile.symbol) });
    btn.image_id = imgId;
  } else {
    btn.ext_sayable_symbol = tile.symbol; // emoji — round-trips, ignored by other tools
  }
  return btn;
}

function boardToObf(board: Board): ObfBoard {
  const cols = Math.max(1, board.cols);
  const rows = gridRows(board);
  const buttons: ObfButton[] = [];
  const images: ObfImage[] = [];
  const order: (string | null)[][] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const tile = board.tiles[idx++];
      // A blank is an authored gap, which OBF spells as a null cell with no
      // button - exactly how a cell past the end of the board is spelled too.
      if (tile && tile.action.kind !== 'blank') {
        row.push(tile.id);
        buttons.push(tileToButton(tile, images));
      } else {
        row.push(null);
      }
    }
    order.push(row);
  }
  return {
    format: OBF_FORMAT,
    id: board.id,
    locale: 'en',
    name: board.name,
    buttons,
    images,
    grid: { rows, columns: cols, order },
  };
}

/** A whole profile as an `.obz` (ZIP) byte array. */
export async function profileToObz(profile: Profile): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const boardPaths: Record<string, string> = {};

  const boards = Object.values(profile.boards);
  // Stamp the profile name onto the root board so a round-trip keeps it.
  const rootObf = boardToObf(profile.boards[profile.homeId]);
  rootObf.ext_sayable_profile_name = profile.name;
  for (const board of boards) {
    const obf = board.id === profile.homeId ? rootObf : boardToObf(board);
    const path = `boards/${board.id}.obf`;
    boardPaths[board.id] = path;
    entries.push({ name: path, data: enc.encode(JSON.stringify(obf)) });
  }

  const manifest = {
    format: OBF_FORMAT,
    root: `boards/${profile.homeId}.obf`,
    paths: { boards: boardPaths },
  };
  entries.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) });
  return zip(entries);
}

export function obzFileName(name: string, date: Date): string {
  const s = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'boards';
  return `sayable-${s}-${date.toISOString().slice(0, 10)}.obz`;
}

// ================= IMPORT =================

async function resolveImage(
  img: ObfImage | undefined,
  files: Map<string, Uint8Array> | null,
): Promise<string | null> {
  if (!img) return null;
  if (img.data) return img.data.startsWith('data:') ? img.data : `data:${img.content_type ?? 'image/png'};base64,${img.data}`;
  if (img.url) return img.url;
  if (img.path && files) {
    const bytes = files.get(img.path) ?? files.get(img.path.replace(/^\.?\//, ''));
    if (bytes) return `data:${img.content_type ?? 'image/png'};base64,${u8ToBase64(bytes)}`;
  }
  return null;
}

/** A blank cell, used for both authored gaps and OBF buttons we can't honour. */
function blankTile(): Tile {
  return { id: rid('t'), text: '', symbol: '', bg: DEFAULT_SPEAK_BG, action: { kind: 'blank' } };
}

/**
 * True for OBF's specialty buttons (`:clear`, `:backspace`, `:home`, ...).
 * Sayable has those controls in the sentence bar, so importing one as an
 * ordinary tile would make a "Clear" button that literally says "clear" out
 * loud. We keep its cell and drop the button.
 */
function isSpecialtyAction(btn: ObfButton): boolean {
  if (btn.load_board) return false; // navigation wins; it's a folder, not a control
  const all = [btn.action, ...(btn.actions ?? [])];
  return all.some((a) => typeof a === 'string' && a.startsWith(':'));
}

/** How a `.obz` lets us check a `load_board` link against the boards it ships. */
interface BoardIndex {
  ids: Set<string>; // every board id in the bundle
  byPath: Map<string, string>; // "boards/foo.obf" -> that board's id
}

async function buttonToTile(
  btn: ObfButton,
  imagesById: Map<string, ObfImage>,
  files: Map<string, Uint8Array> | null,
  index: BoardIndex | null,
): Promise<Tile> {
  if (isSpecialtyAction(btn)) return blankTile();

  const text = (btn.label ?? '').toString();
  const lb = btn.load_board;
  let boardId: string | undefined;
  if (lb) {
    const byId = lb.id != null ? String(lb.id) : undefined;
    const p = lb.path;
    const byPath = p ? (index?.byPath.get(p) ?? index?.byPath.get(p.replace(/^\.?\//, ''))) : undefined;
    // An id naming a board we actually have wins. Failing that, take the path:
    // some exporters write only a path, and others write an id that names the
    // board's *source*, not the copy in this bundle. Last resort is the raw id,
    // which is all a single-.obf import has to go on.
    boardId = (byId && index?.ids.has(byId) ? byId : undefined) ?? byPath ?? byId;
  }
  const goto = boardId != null;
  const action: TileAction = boardId != null ? { kind: 'goto', boardId } : { kind: 'speak' };

  let symbol = '';
  if (btn.image_id != null) {
    symbol = (await resolveImage(imagesById.get(String(btn.image_id)), files)) ?? '';
  }
  if (!symbol && btn.ext_sayable_symbol) symbol = btn.ext_sayable_symbol;
  if (!symbol) symbol = goto ? '📂' : '💬'; // Sayable always needs a glyph

  const tile: Tile = {
    id: String(btn.id ?? rid('t')),
    text: text || symbol,
    symbol,
    bg: colorToHex(btn.background_color, goto ? DEFAULT_GOTO_BG : DEFAULT_SPEAK_BG),
    action,
  };
  if (btn.vocalization && btn.vocalization.trim() && btn.vocalization !== text) tile.spoken = btn.vocalization;
  if (btn.hidden === true) tile.hidden = true;
  return tile;
}

async function obfToBoard(
  obf: ObfBoard,
  files: Map<string, Uint8Array> | null,
  index: BoardIndex | null = null,
): Promise<Board> {
  const buttonsById = new Map<string, ObfButton>((obf.buttons ?? []).map((b) => [String(b.id), b]));
  const imagesById = new Map<string, ObfImage>((obf.images ?? []).map((im) => [String(im.id), im]));
  const cols = Math.max(1, obf.grid?.columns ?? (Math.ceil(Math.sqrt((obf.buttons ?? []).length)) || 1));
  const rows = obf.grid?.rows ?? (Math.ceil((obf.buttons ?? []).length / cols) || 1);

  // Walk the grid in reading order. An empty cell becomes a blank tile so the
  // author's spacing survives - in an AAC layout a gap is a landmark, and
  // compacting it away would slide every word after it into a new position.
  // Then append any button the grid never placed, so nothing is silently lost.
  const placed = new Set<string>();
  const ordered: (ObfButton | null)[] = [];
  if (obf.grid?.order) {
    for (const row of obf.grid.order) {
      for (const cell of row ?? []) {
        if (cell == null) {
          ordered.push(null);
          continue;
        }
        const b = buttonsById.get(String(cell));
        if (b && !placed.has(String(cell))) {
          ordered.push(b);
          placed.add(String(cell));
        } else if (!b) {
          ordered.push(null); // the grid names a button this board doesn't ship
        }
      }
    }
  }
  // Trailing gaps are just the unused tail of the last row, not authored space.
  while (ordered.length && ordered[ordered.length - 1] === null) ordered.pop();
  for (const b of obf.buttons ?? []) {
    if (!placed.has(String(b.id))) ordered.push(b);
  }

  const tiles: Tile[] = [];
  for (const b of ordered) tiles.push(b ? await buttonToTile(b, imagesById, files, index) : blankTile());

  return { id: String(obf.id ?? rid('b')), name: obf.name ?? 'Board', rows, cols, tiles };
}

export interface ParseResult {
  ok: boolean;
  profile?: Profile;
  error?: string;
}

/** Build a Profile from a parsed single-board `.obf`. */
async function singleObfToProfile(obf: ObfBoard): Promise<ParseResult> {
  const board = await obfToBoard(obf, null);
  const profile: Profile = {
    id: rid('p'),
    name: obf.ext_sayable_profile_name || obf.name || 'Imported board',
    homeId: board.id,
    boards: { [board.id]: board },
  };
  if (!isValidProfile(profile)) return { ok: false, error: 'That board file is incomplete or unsupported.' };
  return { ok: true, profile };
}

/** Build a Profile from a `.obz` byte array. */
export async function obzToProfile(bytes: Uint8Array): Promise<ParseResult> {
  let files: Map<string, Uint8Array>;
  try {
    files = await unzip(bytes);
  } catch {
    return { ok: false, error: 'That file isn’t a readable .obz bundle.' };
  }
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) return { ok: false, error: 'This .obz is missing its manifest.' };

  let manifest: { root?: string; paths?: { boards?: Record<string, string> } };
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    return { ok: false, error: 'This .obz has an unreadable manifest.' };
  }

  const boardPaths = Object.values(manifest.paths?.boards ?? {});
  if (!boardPaths.length) return { ok: false, error: 'This .obz contains no boards.' };

  // Parse every board first, so a button that links by path (rather than by id)
  // has something to resolve against before any of them are converted.
  const parsed: { path: string; obf: ObfBoard }[] = [];
  for (const path of boardPaths) {
    const raw = files.get(path) ?? files.get(path.replace(/^\.?\//, ''));
    if (!raw) continue;
    try {
      parsed.push({ path, obf: JSON.parse(new TextDecoder().decode(raw)) });
    } catch {
      continue; // one unreadable board shouldn't sink the whole set
    }
  }
  const index: BoardIndex = { ids: new Set(), byPath: new Map() };
  for (const { path, obf } of parsed) {
    const id = String(obf.id ?? '');
    if (!id) continue;
    index.ids.add(id);
    index.byPath.set(path, id);
    index.byPath.set(path.replace(/^\.?\//, ''), id);
  }

  const boards: Record<string, Board> = {};
  let profileName = 'Imported boards';
  for (const { obf } of parsed) {
    const board = await obfToBoard(obf, files, index);
    boards[board.id] = board;
    if (obf.ext_sayable_profile_name) profileName = obf.ext_sayable_profile_name;
  }
  if (!Object.keys(boards).length) return { ok: false, error: 'None of the boards in this .obz could be read.' };

  // Home = the manifest root, if it resolves; otherwise the first board.
  const rootId = manifest.root
    ? (Object.entries(manifest.paths?.boards ?? {}).find(([, p]) => p === manifest.root)?.[0])
    : undefined;
  const homeId = rootId && boards[rootId] ? rootId : Object.keys(boards)[0];

  const profile: Profile = { id: rid('p'), name: profileName, homeId, boards };
  if (!isValidProfile(profile)) return { ok: false, error: 'The boards in this .obz are incomplete or unsupported.' };
  return { ok: true, profile };
}

/** True when parsed JSON looks like a single OBF board. */
export function looksLikeObf(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const f = (obj as Record<string, unknown>).format;
  return typeof f === 'string' && f.startsWith('open-board');
}

export async function singleObfTextToProfile(text: string): Promise<ParseResult> {
  let obf: ObfBoard;
  try {
    obf = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid OBF JSON.' };
  }
  return singleObfToProfile(obf);
}
