// Shared vocabulary colors (a loose, Fitzgerald-Key-inspired convention) plus a
// distinct shape per category for shape-coding (a non-color channel that helps
// colorblind / low-vision users tell word types apart). Also a quick-pick emoji
// set. Used by the seed boards, the tile editor, and the category badge.

export type CategoryShape = 'circle' | 'triangle' | 'diamond' | 'square' | 'heart' | 'folder';

export interface Category {
  key: string;
  label: string;
  color: string;
  shape: CategoryShape;
}

export const CATEGORIES: Category[] = [
  { key: 'people', label: 'People', color: '#ffe08a', shape: 'circle' }, // yellow
  { key: 'action', label: 'Action', color: '#a7e3a7', shape: 'triangle' }, // green
  { key: 'little', label: 'Describe', color: '#a9c8f5', shape: 'diamond' }, // blue
  { key: 'thing', label: 'Thing', color: '#ffc9a3', shape: 'square' }, // orange
  { key: 'social', label: 'Social', color: '#f3b6d6', shape: 'heart' }, // pink
  { key: 'folder', label: 'Folder', color: '#d7dbe0', shape: 'folder' }, // grey
];

export const COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.color]),
);

/** Map a tile's background color back to its category (for the shape badge). */
export function categoryForColor(color: string): Category | undefined {
  if (!color) return undefined;
  const c = color.toLowerCase();
  return CATEGORIES.find((cat) => cat.color.toLowerCase() === c);
}

export const QUICK_EMOJIS = [
  '⭐', '❤️', '👍', '🙏', '😊', '😢', '😠', '😴',
  '🎉', '🍎', '🍌', '💧', '🥛', '🍪', '🍕', '🎮',
  '🎵', '📖', '⚽', '🏠', '🏫', '🚗', '🌳', '🚽',
  '🆘', '✅', '❌', '➕', '🏁', '👋', '🤗', '📂',
];
