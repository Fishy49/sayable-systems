// Minimal IndexedDB layer.
//   kv       — the single live app record
//   snapMeta — lightweight snapshot metadata (listed without loading images)
//   snapData — the full snapshot payload, keyed by the same id as its meta
//
// Meta and data are split so the Backups list can render from tiny metadata
// without pulling every snapshot's embedded images into memory.

const DB_NAME = 'sayable';
const KV = 'kv';
const SNAP_META = 'snapMeta';
const SNAP_DATA = 'snapData';
const VERSION = 2;

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
