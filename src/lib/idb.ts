// Minimal IndexedDB layer.
//   kv          - the single live app record
//   snapMeta    - lightweight snapshot metadata (listed without loading images)
//   snapData    - the full snapshot payload, keyed by the same id as its meta
//   usageEvents - opt-in usage log, raw rows for the recent window
//   usageWeeks  - weekly roll-ups of everything older, kept after raw is pruned
//
// Meta and data are split so the Backups list can render from tiny metadata
// without pulling every snapshot's embedded images into memory.
//
// Usage rows live in their own stores, never inside a Profile, so exporting or
// importing a profile can never carry a communicator's logged speech with it.

const DB_NAME = 'sayable';
const KV = 'kv';
const SNAP_META = 'snapMeta';
const SNAP_DATA = 'snapData';
const USAGE_EVENTS = 'usageEvents';
const USAGE_WEEKS = 'usageWeeks';
const VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(SNAP_META)) db.createObjectStore(SNAP_META, { autoIncrement: true });
      if (!db.objectStoreNames.contains(SNAP_DATA)) db.createObjectStore(SNAP_DATA);
      if (!db.objectStoreNames.contains(USAGE_EVENTS)) {
        // Indexed on time: every read is a date range, and pruning walks the
        // oldest rows first.
        db.createObjectStore(USAGE_EVENTS, { autoIncrement: true }).createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains(USAGE_WEEKS)) {
        db.createObjectStore(USAGE_WEEKS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      // Let another tab upgrade the schema without being blocked by us.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ---- kv: the live app record ----
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(KV, 'readonly');
    const req = tx.objectStore(KV).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV, 'readwrite');
    tx.objectStore(KV).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- snapshots ----
export interface SnapMeta {
  id: number;
  ts: number;
  label: string;
  profiles: number;
  boards: number;
}

export async function snapAdd(meta: Omit<SnapMeta, 'id'>, data: unknown): Promise<number> {
  const db = await openDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([SNAP_META, SNAP_DATA], 'readwrite');
    let id = 0;
    const addReq = tx.objectStore(SNAP_META).add(meta);
    addReq.onsuccess = () => {
      id = addReq.result as number;
      tx.objectStore(SNAP_DATA).put(data, id);
    };
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function snapListMeta(): Promise<SnapMeta[]> {
  const db = await openDb();
  return new Promise<SnapMeta[]>((resolve, reject) => {
    const tx = db.transaction(SNAP_META, 'readonly');
    const out: SnapMeta[] = [];
    const req = tx.objectStore(SNAP_META).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        out.push({ id: cur.key as number, ...(cur.value as Omit<SnapMeta, 'id'>) });
        cur.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function snapGetData(id: number): Promise<unknown> {
  const db = await openDb();
  return new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(SNAP_DATA, 'readonly');
    const req = tx.objectStore(SNAP_DATA).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function snapDelete(id: number): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SNAP_META, SNAP_DATA], 'readwrite');
    tx.objectStore(SNAP_META).delete(id);
    tx.objectStore(SNAP_DATA).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---- usage log ----

export interface UsageEventRow {
  ts: number;
  profileId: string;
  kind: 'word' | 'utterance' | 'nav';
  text: string;
  words?: number; // utterance length, for MLU
}

export interface UsageWeekRow {
  key: string; // `${profileId}|${weekStart}`
  profileId: string;
  weekStart: number;
  words: number; // word selections
  utterances: number;
  utteranceWords: number; // total words across utterances, for MLU
  navs: number;
  uniqueWords: number;
  topWords: [string, number][];
  activeDays: number;
}

export async function usageAdd(row: UsageEventRow): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(USAGE_EVENTS, 'readwrite');
    tx.objectStore(USAGE_EVENTS).add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Raw events in [from, to), oldest first. Omit bounds for everything. */
export async function usageRange(from = -Infinity, to = Infinity): Promise<UsageEventRow[]> {
  const db = await openDb();
  return new Promise<UsageEventRow[]>((resolve, reject) => {
    const tx = db.transaction(USAGE_EVENTS, 'readonly');
    const idx = tx.objectStore(USAGE_EVENTS).index('ts');
    const lower = Number.isFinite(from) ? from : undefined;
    const upper = Number.isFinite(to) ? to : undefined;
    let range: IDBKeyRange | undefined;
    if (lower !== undefined && upper !== undefined) range = IDBKeyRange.bound(lower, upper, false, true);
    else if (lower !== undefined) range = IDBKeyRange.lowerBound(lower);
    else if (upper !== undefined) range = IDBKeyRange.upperBound(upper, true);
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result as UsageEventRow[]);
    req.onerror = () => reject(req.error);
  });
}

export async function usageWeeksAll(): Promise<UsageWeekRow[]> {
  const db = await openDb();
  return new Promise<UsageWeekRow[]>((resolve, reject) => {
    const tx = db.transaction(USAGE_WEEKS, 'readonly');
    const req = tx.objectStore(USAGE_WEEKS).getAll();
    req.onsuccess = () => resolve((req.result as UsageWeekRow[]).sort((a, b) => a.weekStart - b.weekStart));
    req.onerror = () => reject(req.error);
  });
}

/**
 * Collapse raw rows into weekly roll-ups and drop the raw rows, in ONE
 * transaction. Doing both atomically is what keeps a crash mid-prune from
 * either losing the week or counting it twice.
 */
export async function usageCollapse(weeks: UsageWeekRow[], deleteBefore: number): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([USAGE_EVENTS, USAGE_WEEKS], 'readwrite');
    for (const w of weeks) tx.objectStore(USAGE_WEEKS).put(w);
    const cur = tx.objectStore(USAGE_EVENTS).index('ts').openCursor(IDBKeyRange.upperBound(deleteBefore, true));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        c.delete();
        c.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Erase every logged row, raw and rolled up. The caregiver's delete button. */
export async function usageClear(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([USAGE_EVENTS, USAGE_WEEKS], 'readwrite');
    tx.objectStore(USAGE_EVENTS).clear();
    tx.objectStore(USAGE_WEEKS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
