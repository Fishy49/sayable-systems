// A general-purpose starter board set: a home board of high-frequency "core
// words" plus a few category folders. Easy to replace per person later —
// this is just so the app does something meaningful out of the box.

import type { Board, BoardSet, Tile, TileAction } from './types';
import { COLORS as C } from './palette';

let seq = 0;
const nextId = () => `t${++seq}`;

function say(text: string, symbol: string, bg: string): Tile {
  return { id: nextId(), text, symbol, bg, action: { kind: 'speak' } };
}

function folder(text: string, symbol: string, boardId: string): Tile {
  const action: TileAction = { kind: 'goto', boardId };
  return { id: nextId(), text, symbol, bg: C.folder, action };
}

export function seedBoardSet(): BoardSet {
  const home: Board = {
    id: 'home',
    name: 'Home',
    rows: 4,
    cols: 6,
    tiles: [
      say('I', '🙋', C.people),
      say('you', '🫵', C.people),
      say('it', '👇', C.people),
      say('want', '✋', C.action),
      say('go', '🏃', C.action),
      say('stop', '🛑', C.action),

      say('like', '👍', C.action),
      say('make', '🔨', C.action),
      say('look', '👀', C.action),
      say('more', '➕', C.little),
      say('all done', '🏁', C.little),
      say('here', '📍', C.little),

      say('my', '🫳', C.little),
      say('good', '🌟', C.little),
      say('yes', '✅', C.social),
      say('no', '❌', C.social),
      say('help', '🆘', C.social),
      say('please', '🙏', C.social),

      say('thank you', '💖', C.social),
      say('hi', '👋', C.social),
      folder('Food', '🍎', 'food'),
      folder('Feelings', '😊', 'feelings'),
      folder('Places', '🏠', 'places'),
      folder('Fun', '🎉', 'fun'),
    ],
  };

  const food: Board = {
    id: 'food',
    name: 'Food',
    rows: 3,
    cols: 5,
    tiles: [
      say('apple', '🍎', C.thing),
      say('banana', '🍌', C.thing),
      say('water', '💧', C.thing),
      say('milk', '🥛', C.thing),
      say('juice', '🧃', C.thing),
      say('cookie', '🍪', C.thing),
      say('pizza', '🍕', C.thing),
      say('bread', '🍞', C.thing),
      say('cheese', '🧀', C.thing),
      say('egg', '🥚', C.thing),
      say('eat', '🍽️', C.action),
      say('drink', '🥤', C.action),
      say('more', '➕', C.little),
      say('all done', '🏁', C.little),
      folder('Back', '🔙', 'home'),
    ],
  };

  const feelings: Board = {
    id: 'feelings',
    name: 'Feelings',
    rows: 3,
    cols: 5,
    tiles: [
      say('happy', '😊', C.little),
      say('sad', '😢', C.little),
      say('mad', '😠', C.little),
      say('tired', '😴', C.little),
      say('scared', '😨', C.little),
      say('sick', '🤒', C.little),
      say('hurt', '🤕', C.little),
      say('excited', '🤩', C.little),
      say('calm', '😌', C.little),
      say('silly', '🤪', C.little),
      say('I feel', '🙋', C.people),
      say('a little', '🤏', C.little),
      say('really', '❗', C.little),
      say('love', '❤️', C.social),
      folder('Back', '🔙', 'home'),
    ],
  };

  const places: Board = {
    id: 'places',
    name: 'Places',
    rows: 3,
    cols: 5,
    tiles: [
      say('home', '🏠', C.thing),
      say('school', '🏫', C.thing),
      say('park', '🏞️', C.thing),
      say('store', '🛒', C.thing),
      say('car', '🚗', C.thing),
      say('outside', '🌳', C.thing),
      say('bathroom', '🚽', C.thing),
      say('kitchen', '🍳', C.thing),
      say('bedroom', '🛏️', C.thing),
      say('doctor', '🩺', C.thing),
      say('go', '🏃', C.action),
      say('want', '✋', C.action),
      say('here', '📍', C.little),
      say('there', '👉', C.little),
      folder('Back', '🔙', 'home'),
    ],
  };

  const fun: Board = {
    id: 'fun',
    name: 'Fun',
    rows: 3,
    cols: 5,
    tiles: [
      say('play', '🎮', C.action),
      say('music', '🎵', C.thing),
      say('ball', '⚽', C.thing),
      say('book', '📖', C.thing),
      say('draw', '🖍️', C.action),
      say('blocks', '🧱', C.thing),
      say('bubbles', '🫧', C.thing),
      say('dance', '💃', C.action),
      say('tickle', '🤗', C.action),
      say('tablet', '📱', C.thing),
      say('tv', '📺', C.thing),
      say('again', '🔁', C.little),
      say('my turn', '🙋', C.people),
      say('your turn', '🫵', C.people),
      folder('Back', '🔙', 'home'),
    ],
  };

  return {
    version: 1,
    homeId: 'home',
    boards: { home, food, feelings, places, fun },
  };
}
