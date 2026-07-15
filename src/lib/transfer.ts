// Export/import a Profile as one self-contained JSON file. Symbols are already
// embedded as data URLs, so the file needs no external assets.

import type { Profile } from './types';
import { isValidProfile } from './snapshots';

const FORMAT = 'sayable.profile';
const FORMAT_VERSION = 1;

interface ProfileFile {
  format: string;
  version: number;
  exportedAt: string;
  profile: Profile;
}

function slug(name: string): string {
  const s = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'profile';
}

export function fileNameForProfile(name: string, date: Date): string {
  return `sayable-${slug(name)}-${date.toISOString().slice(0, 10)}.json`;
}

export function serializeProfile(profile: Profile, exportedAt: string): string {
  const payload: ProfileFile = { format: FORMAT, version: FORMAT_VERSION, exportedAt, profile };
  return JSON.stringify(payload);
}

export interface ParseResult {
  ok: boolean;
  profile?: Profile;
  error?: string;
}

export function parseProfileFile(text: string): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON.' };
  }
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Unrecognized file.' };
  const f = obj as Record<string, unknown>;
  if (f.format !== FORMAT) return { ok: false, error: 'That doesn’t look like a Sayable profile.' };
  if (typeof f.version === 'number' && f.version > FORMAT_VERSION) {
    return { ok: false, error: 'This profile was made by a newer version of Sayable.' };
  }
  if (!isValidProfile(f.profile)) return { ok: false, error: 'The profile in this file is incomplete or corrupt.' };
  return { ok: true, profile: f.profile as Profile };
}

/**
 * Save text as a file. Prefers the native share sheet where available (esp. iOS
 * PWAs, where the download attribute misbehaves) — giving Save to Files, AirDrop,
 * Mail, etc. — and falls back to a plain download link on desktop.
 */
export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<void> {
  return saveBlobFile(filename, new Blob([text], { type: mime }), mime);
}

/** Save arbitrary bytes (e.g. an .obz ZIP), share-sheet first like saveTextFile. */
export async function saveBinaryFile(filename: string, bytes: Uint8Array, mime: string): Promise<void> {
  return saveBlobFile(filename, new Blob([bytes as BlobPart], { type: mime }), mime);
}

async function saveBlobFile(filename: string, blob: Blob, mime: string): Promise<void> {
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return; // user dismissed the share sheet
    // otherwise fall through to the download path
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
