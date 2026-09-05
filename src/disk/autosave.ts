// Autosave the whole machine to IndexedDB. The real DISK mode (Phase 4) builds on the same store.
import { Machine } from '@/model/types';
import { serializeMachine, deserializeMachine, SerializedProject } from '@/model/serialize';

const DB = 'chopdeck';
const STORE = 'project';
const KEY = 'autosave';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAutosave(m: Machine): Promise<void> {
  const db = await openDb();
  const data = serializeMachine(m);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadAutosave(): Promise<Machine | null> {
  try {
    const db = await openDb();
    const data = await new Promise<SerializedProject | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as SerializedProject | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data ? deserializeMachine(data) : null;
  } catch { return null; }
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  await new Promise<void>(resolve => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
  db.close();
}

/** Debounced autosave wired to firmware.touch(). */
export function startAutosave(getMachine: () => Machine, subscribe: (fn: () => void) => () => void, delayMs = 1500): () => void {
  let timer: number | null = null;
  let saving = false, dirtyDuringSave = false;
  const flush = async () => {
    timer = null;
    if (saving) { dirtyDuringSave = true; return; }
    saving = true;
    try { await saveAutosave(getMachine()); } catch (e) { console.warn('autosave failed', e); }
    saving = false;
    if (dirtyDuringSave) { dirtyDuringSave = false; schedule(); }
  };
  const schedule = () => { if (timer != null) clearTimeout(timer); timer = window.setTimeout(flush, delayMs); };
  const unsub = subscribe(schedule);
  const onHide = () => { if (document.visibilityState === 'hidden' && timer != null) { clearTimeout(timer); void flush(); } };
  document.addEventListener('visibilitychange', onHide);
  return () => { unsub(); document.removeEventListener('visibilitychange', onHide); if (timer != null) clearTimeout(timer); };
}
