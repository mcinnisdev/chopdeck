// A file a Chop Deck page leaves for the machine (a kit from the library, later a beat to open). The
// machine takes it on the next power-on and puts it in the import tray, as if it had been dropped.
import { openChopdeckDb } from './drive';

const STORE = 'project';
const KEY = 'handoff';
export interface Handoff { name: string; bytes: Uint8Array; note?: string; /** save the machine's current state to the browser disk before loading */ setAside?: boolean }

export async function putHandoff(h: Handoff): Promise<void> {
  const db = await openChopdeckDb();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(h, KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  db.close();
}

export async function takeHandoff(): Promise<Handoff | null> {
  try {
    const db = await openChopdeckDb();
    const h = await new Promise<Handoff | undefined>((resolve, reject) => { const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY); req.onsuccess = () => resolve(req.result as Handoff | undefined); req.onerror = () => reject(req.error); });
    if (h) await new Promise<void>(resolve => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
    db.close();
    return h ?? null;
  } catch { return null; }
}
