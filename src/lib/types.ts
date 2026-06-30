// Core data model for Sayable.
//
// The whole app is "a grid of tiles; each tile either speaks a word or opens
// another board." That's it. Everything else is presentation.

export type TileAction =
  | { kind: 'speak' } // say this tile's text and add it to the sentence
  | { kind: 'goto'; boardId: string }; // navigate to another board

export interface Tile {
  id: string;
  text: string; // the word or phrase to speak
  symbol: string; // an emoji glyph today; a picture URL is a drop-in upgrade
  bg: string; // tile background color (hex)
  action: TileAction;
}

export interface Board {
  id: string;
  name: string;
  rows: number;
  cols: number;
  tiles: Tile[];
}

export interface BoardSet {
  version: number;
  homeId: string;
  boards: Record<string, Board>;
}

// One entry in the sentence the communicator is building.
export interface SpokenWord {
  id: string;
  text: string;
  symbol: string;
}
