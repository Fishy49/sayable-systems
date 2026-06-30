// Core data model for Sayable.
//
// The whole app is "a grid of tiles; each tile either speaks a word or opens
// another board." Boards are grouped into a Profile (one per communicator),
// and the app holds a set of profiles with one active at a time.

export type TileAction =
  | { kind: 'speak' } // say this tile's text and add it to the sentence
  | { kind: 'goto'; boardId: string }; // navigate to another board

export interface Tile {
  id: string;
  text: string; // the word or phrase to speak
  symbol: string; // an emoji glyph, or an image (URL / data URL)
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

// A communicator's chosen speech voice (system voiceURI) and speaking rate.
export interface VoicePref {
  uri?: string;
  rate?: number;
}

// A Profile is one person's named set of boards (and their voice).
export interface Profile {
  id: string;
  name: string;
  homeId: string;
  boards: Record<string, Board>;
  voice?: VoicePref;
  showShapes?: boolean; // category shape badges (default on when undefined)
}

// Top-level persisted state: every profile, plus which one is active.
export interface AppData {
  version: number;
  activeProfileId: string;
  profiles: Profile[];
}

// One entry in the sentence the communicator is building.
export interface SpokenWord {
  id: string;
  text: string;
  symbol: string;
}
