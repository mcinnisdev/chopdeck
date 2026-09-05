// The browser disk: files and folders in IndexedDB. Paths are 'FOLDER/SUB/NAME.EXT'; the root is ''.

export type FileType = 'ALL' | 'APS' | 'PGM' | 'SND' | 'WAV' | 'MID' | 'SEQ' | 'DIR';
export interface DiskFile {
  path: string;          // full path, unique
  folder: string;        // parent folder path ('' = root)
  name: string;          // file name with extension (or folder name)
  type: FileType;
  size: number;
  mtime: number;
  data?: Uint8Array;     // file body (absent for DIR)
}

const DB = 'chopdeck';
const STORE = 'files';

/** One database for the project autosave and the file store; every opener shares this version and upgrade. */
export function openChopdeckDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('project')) db.createObjectStore('project');
      if (!db.objectStoreNames.contains(STORE)) { const s = db.createObjectStore(STORE, { keyPath: 'path' }); s.createIndex('folder', 'folder'); }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openChopdeckDb().then(db => new Promise<T>((resolve, reject) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); t.oncomplete = () => db.close(); }));
}

export const typeOf = (name: string): FileType => { const ext = name.split('.').pop()?.toUpperCase() ?? ''; return (['ALL', 'APS', 'PGM', 'SND', 'WAV', 'MID', 'SEQ'] as FileType[]).includes(ext as FileType) ? (ext as FileType) : 'WAV'; };
export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

export interface Drive {
  list(folder: string): Promise<DiskFile[]>;
  read(path: string): Promise<DiskFile | undefined>;
  write(folder: string, name: string, data: Uint8Array, type?: FileType): Promise<DiskFile>;
  mkdir(folder: string, name: string): Promise<DiskFile>;
  remove(path: string): Promise<void>;
  rename(path: string, newName: string): Promise<void>;
  usage(): Promise<number>;
}

export class IdbDrive implements Drive {
  async list(folder: string): Promise<DiskFile[]> {
    const all = await tx<DiskFile[]>('readonly', s => s.index('folder').getAll(folder));
    return all.map(f => ({ ...f, data: undefined })).sort((a, b) => (a.type === 'DIR' ? 0 : 1) - (b.type === 'DIR' ? 0 : 1) || a.name.localeCompare(b.name));
  }
  read(path: string) { return tx<DiskFile | undefined>('readonly', s => s.get(path)); }
  async write(folder: string, name: string, data: Uint8Array, type = typeOf(name)): Promise<DiskFile> {
    const f: DiskFile = { path: joinPath(folder, name), folder, name, type, size: data.length, mtime: Date.now(), data };
    await tx('readwrite', s => s.put(f));
    return { ...f, data: undefined };
  }
  async mkdir(folder: string, name: string): Promise<DiskFile> {
    const f: DiskFile = { path: joinPath(folder, name), folder, name, type: 'DIR', size: 0, mtime: Date.now() };
    await tx('readwrite', s => s.put(f));
    return f;
  }
  async remove(path: string): Promise<void> {
    const f = await this.read(path);
    if (f?.type === 'DIR') for (const child of await this.list(path)) await this.remove(child.path);
    await tx('readwrite', s => s.delete(path));
  }
  async rename(path: string, newName: string): Promise<void> {
    const f = await this.read(path); if (!f) return;
    const moved: DiskFile = { ...f, name: newName, path: joinPath(f.folder, newName), mtime: Date.now() };
    if (f.type === 'DIR') { for (const child of await this.list(path)) { const c = await this.read(child.path); if (c) { await tx('readwrite', s => s.delete(c.path)); await tx('readwrite', s => s.put({ ...c, folder: moved.path, path: joinPath(moved.path, c.name) })); } } }
    await tx('readwrite', s => s.delete(path));
    await tx('readwrite', s => s.put(moved));
  }
  async usage(): Promise<number> { const all = await tx<DiskFile[]>('readonly', s => s.getAll()); return all.reduce((a, f) => a + f.size, 0); }
}

/** In-memory drive for tests and for the import tray. */
export class MemoryDrive implements Drive {
  files = new Map<string, DiskFile>();
  async list(folder: string) { return [...this.files.values()].filter(f => f.folder === folder).map(f => ({ ...f, data: undefined })).sort((a, b) => (a.type === 'DIR' ? 0 : 1) - (b.type === 'DIR' ? 0 : 1) || a.name.localeCompare(b.name)); }
  async read(path: string) { return this.files.get(path); }
  async write(folder: string, name: string, data: Uint8Array, type = typeOf(name)) { const f: DiskFile = { path: joinPath(folder, name), folder, name, type, size: data.length, mtime: Date.now(), data }; this.files.set(f.path, f); return { ...f, data: undefined }; }
  async mkdir(folder: string, name: string) { const f: DiskFile = { path: joinPath(folder, name), folder, name, type: 'DIR', size: 0, mtime: Date.now() }; this.files.set(f.path, f); return f; }
  async remove(path: string) { const f = this.files.get(path); if (f?.type === 'DIR') for (const c of await this.list(path)) await this.remove(c.path); this.files.delete(path); }
  async rename(path: string, newName: string) { const f = this.files.get(path); if (!f) return; this.files.delete(path); const moved = { ...f, name: newName, path: joinPath(f.folder, newName) }; this.files.set(moved.path, moved); if (f.type === 'DIR') for (const c of [...this.files.values()].filter(x => x.folder === path)) { this.files.delete(c.path); this.files.set(joinPath(moved.path, c.name), { ...c, folder: moved.path, path: joinPath(moved.path, c.name) }); } }
  async usage() { return [...this.files.values()].reduce((a, f) => a + f.size, 0); }
}
