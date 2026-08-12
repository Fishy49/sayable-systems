// The local backup: ONE full copy of the app data, refreshed as the boards
// change. Used for self-heal (recover from corruption) and for the caregiver's
// Restore button.
//
// This was a rolling history of fifteen. In day to day use nobody ever restores
// anything but the latest copy - reaching further back would throw away work
// the caregiver remembers doing - so the extra copies bought nothing and cost
// storage on a device that is already short of it.
//
// Keeping only one copy makes that copy matter more, so it is never written
// unless the data validates. A backup that cannot be restored is not a backup,
// and here there is no older one to fall back to.

import type { AppData, Profile } from './types';
import { snapAdd, snapListMeta, snapGetData, snapDelete, type SnapMeta } from './idb';

export type SnapshotMeta = SnapMeta;

function isValidTile(t: unknown): boolean {
  if (!t || typeof t !== 'object') return false;
  const tile = t as Record<string, unknown>;
  if (
    typeof tile.id !== 'string' ||
    typeof tile.text !== 'string' ||
    typeof tile.symbol !== 'string' ||
    typeof tile.bg !== 'string'
  ) {
    return false;
  }
  const a = tile.action as Record<string, unknown> | undefined;
  if (!a || (a.kind !== 'speak' && a.kind !== 'goto' && a.kind !== 'blank')) return false;
  if (a.kind === 'goto' && typeof a.boardId !== 'string') return false;
  return true;
}

/** Defensive shape check for a single profile - gate for self-heal and import. */
export function isValidProfile(p: unknown): p is Profile {
  if (!p || typeof p !== 'object') return false;
  const prof = p as Record<string, unknown>;
  if (typeof prof.id !== 'string' || typeof prof.name !== 'string' || typeof prof.homeId !== 'string') {
    return false;
  }
  if (!prof.boards || typeof prof.boards !== 'object') return false;
  const boards = Object.values(prof.boards as Record<string, unknown>);
  if (boards.length === 0) return false;
  return boards.every((b) => {
    if (!b || typeof b !== 'object') return false;
    const board = b as Record<string, unknown>;
    return (
      typeof board.id === 'string' &&
      typeof board.rows === 'number' &&
      typeof board.cols === 'number' &&
      Array.isArray(board.tiles) &&
      (board.tiles as unknown[]).every(isValidTile)
    );
  });
}

export function isValidAppData(x: unknown): x is AppData {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  if (typeof d.activeProfileId !== 'string') return false;
  if (!Array.isArray(d.profiles) || d.profiles.length === 0) return false;
  return d.profiles.every(isValidProfile);
}

function countBoards(data: AppData): number {
  return data.profiles.reduce((n, p) => n + Object.keys(p.boards).length, 0);
}

async function metasNewestFirst(): Promise<SnapshotMeta[]> {
  return (await snapListMeta()).sort((a, b) => b.ts - a.ts);
}

/**
 * Replace the backup with a copy of `data`.
 *
 * Refuses to write anything that would not survive a restore, because the copy
 * it replaces is the only one there is. Silently does nothing in that case:
 * the previous good backup stays put, which is the outcome we want.
 */
export async function takeSnapshot(data: AppData, label: string): Promise<void> {
  if (!isValidAppData(data)) return;
  const keepId = await snapAdd(
    { ts: Date.now(), label, profiles: data.profiles.length, boards: countBoards(data) },
    data,
  );
  // Written first, then the old copy is dropped, so a crash in between leaves
  // two backups rather than none.
  for (const m of await snapListMeta()) {
    if (m.id !== keepId) await snapDelete(m.id);
  }
}

/** The backup's metadata, or null before the first one is written. */
export async function currentSnapshot(): Promise<SnapshotMeta | null> {
  return (await metasNewestFirst())[0] ?? null;
}

/**
 * Fold a leftover rolling history down to a single copy, keeping the newest one
 * that still restores. Runs at boot for anyone upgrading from the old fifteen;
 * a no-op once there is only one.
 */
export async function collapseBackups(): Promise<void> {
  const metas = await metasNewestFirst();
  if (metas.length <= 1) return;
  // The newest is not automatically the good one - that is the whole reason the
  // old design kept a list - so pick the newest that actually validates.
  let keepId = metas[0].id;
  for (const m of metas) {
    const data = await snapGetData(m.id).catch(() => undefined);
    if (isValidAppData(data)) {
      keepId = m.id;
      break;
    }
  }
  for (const m of metas) {
    if (m.id !== keepId) await snapDelete(m.id);
  }
}

/** Newest backup whose payload still validates - the self-heal source. */
export async function newestValidSnapshot(): Promise<{ data: AppData; ts: number } | null> {
  for (const m of await metasNewestFirst()) {
    const data = await snapGetData(m.id).catch(() => undefined);
    if (isValidAppData(data)) return { data, ts: m.ts };
  }
  return null;
}

export async function getSnapshotData(id: number): Promise<AppData | null> {
  const data = await snapGetData(id).catch(() => undefined);
  return isValidAppData(data) ? data : null;
}
