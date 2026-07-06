// Local snapshots: a bounded, rolling history of full app-data copies used for
// self-heal (recover from corruption) and rollback (user-facing restore).

import type { AppData } from './types';
import { snapAdd, snapListMeta, snapGetData, snapDelete, type SnapMeta } from './idb';

export type SnapshotMeta = SnapMeta;
export const MAX_SNAPSHOTS = 15;

/** Defensive shape check — also the gate for self-heal and (later) import. */
export function isValidAppData(x: unknown): x is AppData {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  if (typeof d.activeProfileId !== 'string') return false;
  if (!Array.isArray(d.profiles) || d.profiles.length === 0) return false;
  return d.profiles.every((p) => {
    if (!p || typeof p !== 'object') return false;
    const prof = p as Record<string, unknown>;
    if (typeof prof.id !== 'string' || typeof prof.name !== 'string' || typeof prof.homeId !== 'string') {
      return false;
    }
    if (!prof.boards || typeof prof.boards !== 'object') return false;
    return Object.values(prof.boards as Record<string, unknown>).every((b) => {
      if (!b || typeof b !== 'object') return false;
      const board = b as Record<string, unknown>;
      return (
        typeof board.id === 'string' &&
        typeof board.rows === 'number' &&
        typeof board.cols === 'number' &&
        Array.isArray(board.tiles)
      );
    });
  });
}

function countBoards(data: AppData): number {
  return data.profiles.reduce((n, p) => n + Object.keys(p.boards).length, 0);
}

export async function takeSnapshot(data: AppData, label: string): Promise<void> {
  await snapAdd(
    { ts: Date.now(), label, profiles: data.profiles.length, boards: countBoards(data) },
    data,
  );
  await prune();
}

async function prune(): Promise<void> {
  const metas = (await snapListMeta()).sort((a, b) => b.ts - a.ts);
  for (const m of metas.slice(MAX_SNAPSHOTS)) await snapDelete(m.id);
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  return (await snapListMeta()).sort((a, b) => b.ts - a.ts);
}

/** Newest snapshot whose payload still validates — the self-heal source. */
export async function newestValidSnapshot(): Promise<{ data: AppData; ts: number } | null> {
  const metas = (await snapListMeta()).sort((a, b) => b.ts - a.ts);
  for (const m of metas) {
    const data = await snapGetData(m.id).catch(() => undefined);
    if (isValidAppData(data)) return { data, ts: m.ts };
  }
  return null;
}

export async function getSnapshotData(id: number): Promise<AppData | null> {
  const data = await snapGetData(id).catch(() => undefined);
  return isValidAppData(data) ? data : null;
}

export async function deleteSnapshot(id: number): Promise<void> {
  await snapDelete(id);
}
