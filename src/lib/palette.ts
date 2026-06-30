// Shared vocabulary colors (a loose, Fitzgerald-Key-inspired convention) and a
// quick-pick emoji set. Used by both the seed boards and the tile editor so the
// two always agree.

export interface Category {
  key: string;
  label: string;
  color: string;
}

export const CATEGORIES: Category[] = [
  { key: 'people', label: 'People', color: '#ffe08a' }, // yellow
  { key: 'action', label: 'Action', color: '#a7e3a7' }, // green
  { key: 'little', label: 'Describe', color: '#a9c8f5' }, // blue
  { key: 'thing', label: 'Thing', color: '#ffc9a3' }, // orange
  { key: 'social', label: 'Social', color: '#f3b6d6' }, // pink
  { key: 'folder', label: 'Folder', color: '#d7dbe0' }, // grey
];

export const COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.color]),
);

export const QUICK_EMOJIS = [
  '⭐', '❤️', '👍', '🙏', '😊', '😢', '😠', '😴',
  '🎉', '🍎', '🍌', '💧', '🥛', '🍪', '🍕', '🎮',
  '🎵', '📖', '⚽', '🏠', '🏫', '🚗', '🌳', '🚽',
  '🆘', '✅', '❌', '➕', '🏁', '👋', '🤗', '📂',
];
