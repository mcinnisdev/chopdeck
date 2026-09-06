// Account sync. Watches the same changes autosave does and, when the site says you are signed in,
// pushes the project manifest and any sound blobs the server lacks. Pulls on boot when the account
// has a newer revision than this browser has seen. Offline it waits; nothing here touches the LCD.
import { Machine } from '@/model/types';
import { buildManifest, machineFromManifest, isManifest, projectTitle, type ProjectManifest } from './manifest';

export type SyncStatus = 'booting' | 'signed-out' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
export interface SyncUser { id: string; email: string; handle: string | null; plan: string }
export interface SyncState { status: SyncStatus; user: SyncUser | null; revision: number; error: string | null }

const MARK_KEY = 'chopdeck.sync';
interface Mark { revision: number; pushedAt: string }
const readMark = (): Mark => { try { return JSON.parse(localStorage.getItem(MARK_KEY) ?? '') as Mark; } catch { return { revision: 0, pushedAt: '' }; } };
const writeMark = (m: Mark) => { try { localStorage.setItem(MARK_KEY, JSON.stringify(m)); } catch { /* private mode */ } };

const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });

export class SyncClient {
  private state: SyncState = { status: 'booting', user: null, revision: readMark().revision, error: null };
  private listeners = new Set<() => void>();
  private timer: number | null = null;
  private pushing = false;
  private dirtyDuringPush = false;
  private getMachine: (() => Machine) | null = null;
  private getTempo: (() => number) | null = null;
  readonly delayMs: number;

  constructor(delayMs = 4000) {
    this.delayMs = delayMs;
    if (typeof window !== 'undefined') window.addEventListener('online', () => { if (this.state.status === 'offline') this.schedule(); });
  }

  get snapshot(): SyncState { return this.state; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(patch: Partial<SyncState>) { this.state = { ...this.state, ...patch }; for (const fn of this.listeners) fn(); }

  /**
   * Ask the site who we are. Returns a machine to install when the account holds a newer revision
   * than this browser last pushed or pulled (or the browser has nothing at all).
   */
  async boot(hasLocal: boolean): Promise<{ machine: Machine; masterTempo: number; missing: string[] } | null> {
    let me: { user: SyncUser; project: { revision: number } | null };
    try {
      const r = await api('/me');
      if (r.status === 401) { this.set({ status: 'signed-out', user: null }); return null; }
      if (!r.ok) throw new Error(`me ${r.status}`);
      me = await r.json() as typeof me;
    } catch { this.set({ status: 'offline' }); return null; }
    this.set({ user: me.user, status: 'idle' });
    const known = readMark().revision;
    if (!me.project) { if (hasLocal) this.schedule(); return null; }
    if (hasLocal && me.project.revision <= known) return null;
    try {
      const pulled = await this.pull();
      writeMark({ revision: pulled.revision, pushedAt: new Date().toISOString() });
      this.set({ status: 'synced', revision: pulled.revision });
      return pulled;
    } catch (e) { this.set({ status: 'error', error: String(e) }); return null; }
  }

  /** Fetch the account's current project and every blob it names. */
  async pull(): Promise<{ machine: Machine; masterTempo: number; missing: string[]; revision: number }> {
    const r = await api('/project');
    if (!r.ok) throw new Error(`project ${r.status}`);
    const p = await r.json() as { manifest: unknown; revision: number };
    if (!isManifest(p.manifest)) throw new Error('bad manifest');
    const blobs = await fetchBlobs(Object.values(p.manifest.blobs));
    return { ...machineFromManifest(p.manifest, blobs), revision: p.revision };
  }

  /** Wire the sources; call `changed()` whenever the machine changes (autosave already knows when). */
  attach(getMachine: () => Machine, getTempo: () => number) { this.getMachine = getMachine; this.getTempo = getTempo; }
  changed() { if (this.state.user) this.schedule(); }

  private schedule() {
    if (!this.state.user || !this.getMachine) return;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.timer = null; void this.push(); }, this.delayMs);
  }

  /** Push now: hash sounds, upload the ones the server lacks, store the manifest. */
  async push(): Promise<void> {
    if (!this.state.user || !this.getMachine || !this.getTempo) return;
    if (this.pushing) { this.dirtyDuringPush = true; return; }
    this.pushing = true;
    this.set({ status: 'syncing', error: null });
    try {
      const { manifest, blobs } = await buildManifest(this.getMachine(), this.getTempo());
      const hashes = Array.from(blobs.keys());
      const missing = await this.missing(hashes);
      for (const h of missing) await this.upload(h, blobs.get(h)!);
      const res = await this.put(manifest, hashes);
      writeMark({ revision: res.revision, pushedAt: res.updatedAt });
      this.set({ status: 'synced', revision: res.revision });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      this.set({ status: offline ? 'offline' : 'error', error: String(e) });
    } finally {
      this.pushing = false;
      if (this.dirtyDuringPush) { this.dirtyDuringPush = false; this.schedule(); }
    }
  }

  private async missing(hashes: string[]): Promise<string[]> {
    const out: string[] = [];
    await Promise.all(hashes.map(async h => { const r = await api(`/blobs/${h}`, { method: 'HEAD' }); if (r.status === 404) out.push(h); else if (!r.ok) throw new Error(`head ${r.status}`); }));
    return out;
  }
  private async upload(hash: string, bytes: Uint8Array) {
    const r = await api(`/blobs/${hash}`, { method: 'POST', body: bytes as BodyInit, headers: { 'content-type': 'application/zip' } });
    if (r.status === 507) throw new Error('cloud storage is full');
    if (!r.ok) throw new Error(`upload ${r.status}`);
  }
  private async put(manifest: ProjectManifest, hashes: string[]): Promise<{ revision: number; updatedAt: string }> {
    let r = await api('/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest, title: manifest.title, hashes }) });
    if (r.status === 409) {
      // a blob vanished between HEAD and PUT: upload what it names and try once more
      const { missing } = await r.json() as { missing: string[] };
      const { blobs } = await buildManifest(this.getMachine!(), this.getTempo!());
      for (const h of missing) if (blobs.has(h)) await this.upload(h, blobs.get(h)!);
      r = await api('/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifest, title: manifest.title, hashes }) });
    }
    if (!r.ok) throw new Error(`save ${r.status}`);
    return await r.json() as { revision: number; updatedAt: string };
  }

  /** Forget the account in this browser (the server session is ended by the account page). */
  signedOut() { this.set({ status: 'signed-out', user: null }); }
}

export async function fetchBlobs(hashes: string[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  await Promise.all(Array.from(new Set(hashes)).map(async h => {
    const r = await api(`/blobs/${h}`);
    if (r.ok) out.set(h, new Uint8Array(await r.arrayBuffer()));
  }));
  return out;
}

export { projectTitle };
/** The one sync client the machine and the header share. */
export const sync = new SyncClient();
