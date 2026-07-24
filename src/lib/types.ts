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
  text: string; // the word or phrase shown on the tile
  symbol: string; // an emoji glyph, or an image (URL / data URL)
  bg: string; // tile background color (hex)
  action: TileAction;
  spoken?: string; // advanced: what to SAY, if different from the displayed text
  // Masked out of the talking view (progressive vocabulary reveal). The tile
  // KEEPS its slot in `tiles` and on screen - an empty placeholder renders in
  // its place - so revealing a word never moves the words already learned.
  hidden?: boolean;
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
  // Caregiver lock: hash of a 4-digit PIN. When set, editing/settings/profiles
  // ask for the PIN. App-level on purpose — the lock belongs to the device,
  // so it never travels with an exported profile.
  lockPin?: string;
}

// One entry in the sentence the communicator is building.
export interface SpokenWord {
  id: string;
  text: string; // what shows in the sentence bar
  symbol: string;
  spoken?: string; // what to actually speak on readback, if it differs from text
}
