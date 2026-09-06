// DISK: LOAD (browser disk with folders + the import tray), SAVE (every save type + mixdown), FORMAT.
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_PROGRAMS, Machine } from '@/model/types';
import { pad2, bytesStr } from '@/model/format';
import { newProgram, newSequence } from '@/model/factory';
import { Drive, DiskFile, FileType, MemoryDrive, typeOf } from '@/disk/drive';
import { encodeAll, decodeAll, applyAll, encodeSeq, decodeSeq, encodePgm, decodePgm, encodeAps, decodeAps, encodeSnd, encodeProject, decodeProject, mergeSounds, soundFromWav } from '@/disk/formats';
import { encodeSmf, decodeSmf } from '@/disk/smf';
import { encodeWav } from '@/disk/wav';
import { bounce } from '@/audio/bounce';
import { enumField, nameField, intField, boolField, clamp } from './util';
import { seqOf } from './main';
import { defaultNote } from './load';

// ---------- state ----------
let drive: Drive = new MemoryDrive();
export function installDrive(d: Drive) { drive = d; entries = []; }
let entries: DiskFile[] = [];          // current folder listing (refreshed on enter and after changes)
let usage = 0;
type Device = 'BROWSER' | 'IMPORT';
type Save = 'Save All Sequences & Songs' | 'Save a Sequence' | 'Save All Program & Sounds' | 'Save a Program & Sounds' | 'Save a Sound' | 'Save Mixdown (WAV)' | 'Save Project Bundle';
const SAVES: readonly Save[] = ['Save All Sequences & Songs', 'Save a Sequence', 'Save All Program & Sounds', 'Save a Program & Sounds', 'Save a Sound', 'Save Mixdown (WAV)', 'Save Project Bundle'];
const VIEWS = ['ALL Files', '.WAV', '.SND', '.PGM', '.APS', '.ALL', '.SEQ', '.MID'] as const;
export const diskState = { device: 'BROWSER' as Device, view: 'ALL Files' as typeof VIEWS[number], save: 'Save All Sequences & Songs' as Save, name: '', midiType: 'MIDI FILE TYPE 1' as 'MIDI FILE TYPE 0' | 'MIDI FILE TYPE 1' | 'SEQ', withSounds: 'WITH SOUNDS' as 'WITH SOUNDS' | 'PROGRAM ONLY', sndType: 'WAV' as 'WAV' | 'SND', mixSource: 'SEQUENCE' as 'SEQUENCE' | 'SONG', target: 'BROWSER' as 'BROWSER' | 'DOWNLOAD', busy: '' };

export async function refresh(c: Ctx): Promise<void> {
  try { entries = await drive.list(c.s.diskFolder); usage = await drive.usage(); } catch { entries = []; }
  c.s.diskIndex = clamp(c.s.diskIndex, 0, Math.max(0, shown(c).length - 1));
  c.fw.touch();
}
const ext = (n: string) => (n.includes('.') ? `.${n.split('.').pop()!.toUpperCase()}` : '');
function shown(c: Ctx): DiskFile[] {
  if (diskState.device === 'IMPORT') return c.s.importFiles.map(f => ({ path: f.name, folder: '', name: f.name, type: typeOf(f.name), size: f.size, mtime: 0 }));
  const list = entries.filter(f => f.type === 'DIR' || diskState.view === 'ALL Files' || ext(f.name) === diskState.view);
  return c.s.diskFolder ? [{ path: '..', folder: '', name: '..', type: 'DIR', size: 0, mtime: 0 }, ...list] : list;
}
const current = (c: Ctx): DiskFile | undefined => shown(c)[c.s.diskIndex];
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');

async function bytesOf(c: Ctx, f: DiskFile): Promise<Uint8Array | null> {
  if (diskState.device === 'IMPORT') { const imp = c.s.importFiles.find(x => x.name === f.name); return imp ? new Uint8Array(await imp.blob.arrayBuffer()) : null; }
  const full = await drive.read(f.path); return full?.data ?? null;
}
function dropImport(c: Ctx, name: string) { c.s.importFiles = c.s.importFiles.filter(x => x.name !== name); c.s.diskIndex = clamp(c.s.diskIndex, 0, Math.max(0, c.s.importFiles.length - 1)); }

// ---------- footer ----------
const footer = (page: 'LOAD' | 'SAVE' | 'FORMAT', extra: (SoftKeyDef | null)[] = [null, null]): ((c: Ctx) => (SoftKeyDef | null)[]) => () => [
  { label: 'LOAD', kind: page === 'LOAD' ? 'current' : 'page', press: c => { c.fw.setPage('LOAD'); void refresh(c); } },
  { label: 'SAVE', kind: page === 'SAVE' ? 'current' : 'page', press: c => c.fw.setPage('SAVE') },
  { label: 'FORMAT', kind: page === 'FORMAT' ? 'current' : 'page', press: c => c.fw.setPage('FORMAT') },
  ...extra,
  { label: 'DO IT', kind: 'action', press: c => { if (page === 'LOAD') void doLoad(c); else if (page === 'SAVE') void doSave(c); else c.fw.confirm({ title: 'Format disk', lines: ['', 'THIS WILL ERASE THE WHOLE BROWSER DISK!!'], doIt: () => { void (async () => { for (const f of await drive.list('')) await drive.remove(f.path); c.s.diskFolder = ''; await refresh(c); c.fw.message('DISK WIPED'); })(); } }); } },
];

// ---------- LOAD ----------
export const loadPage: ScreenDef = {
  id: 'LOAD',
  fields: () => [
    enumField({ id: 'view', row: 0, col: 5, width: 9, label: 'View:', values: VIEWS, get: () => diskState.view, set: (c, v) => { diskState.view = v; c.s.diskIndex = 0; } }),
    { id: 'file', row: 1, col: 5, width: 20, label: 'File:', get: c => { const f = current(c); return f ? (f.type === 'DIR' ? `[${f.name}]` : f.name.toUpperCase()) : '(no files)'; },
      wheel: (c, d) => { const n = shown(c).length; c.s.diskIndex = n ? clamp(c.s.diskIndex + d, 0, n - 1) : 0; },
      window: c => c.fw.openWindow('DISK/DIRECTORY') },
    enumField({ id: 'device', row: 2, col: 7, width: 7, label: 'Device:', values: ['BROWSER', 'IMPORT'] as const, get: () => diskState.device, set: (c, v) => { diskState.device = v; c.s.diskIndex = 0; } }),
  ],
  draw(c, f) {
    const file = current(c);
    text(f, 0, 27, `:${diskState.device === 'IMPORT' ? 'IMPORT' : c.s.diskFolder || 'ROOT'} (folder)`.slice(0, 21), ATTR_DIM);
    if (file && file.type !== 'DIR') text(f, 1, 27, `Size=${bytesStr(file.size).padStart(6, ' ')}`);
    const sndBytes = c.m.sounds.reduce((a, s) => a + s.length * s.channels * 2, 0);
    text(f, 2, 22, `Free memory snd=${bytesStr(Math.max(0, 32 * 1024 * 1024 - sndBytes)).padEnd(7, ' ')}`);
    text(f, 3, 0, `Type=${file ? (file.type === 'DIR' ? 'FOLDER' : file.type) : '----'}`);
    text(f, 3, 22, `Disk used: ${bytesStr(usage)}`.padEnd(20, ' '), ATTR_DIM);
    const list = shown(c); const n = list.length;
    text(f, 4, 0, n ? `${c.s.diskIndex + 1}/${n} files  DATA wheel scrolls, DO IT loads` : (diskState.device === 'IMPORT' ? 'Drop audio or project files on the machine.' : 'Empty. SAVE writes here; drop files to import.'), ATTR_DIM);
    if (diskState.busy) text(f, 5, 0, diskState.busy);
  },
  softKeys: footer('LOAD', [{ label: 'PICK', kind: 'action', press: c => c.fw.host.pickFiles() }, null]),
  onEnter(c) { void refresh(c); if (c.s.importFiles.length && !entries.length) diskState.device = 'IMPORT'; },
};

/** Open a file already in the import tray as if the user had selected it and pressed DO IT (kits sent from the library). */
export async function loadImported(c: Ctx, name: string): Promise<void> {
  diskState.device = 'IMPORT';
  c.fw.setMode('LOAD');
  const i = shown(c).findIndex(f => f.name === name);
  if (i < 0) return;
  c.s.diskIndex = i;
  await doLoad(c);
  c.fw.touch();
}

async function doLoad(c: Ctx) {
  const f = current(c); if (!f) return;
  if (f.type === 'DIR') { c.s.diskFolder = f.name === '..' ? parentOf(c.s.diskFolder) : f.path; c.s.diskIndex = 0; await refresh(c); return; }
  const bytes = await bytesOf(c, f); if (!bytes) { c.fw.message("CAN'T READ FILE"); return; }
  const kind = ext(f.name);
  const isAudio = /\.(mp3|aif|aiff|flac|ogg|m4a|webm)$/i.test(f.name) || kind === '.WAV' || kind === '.SND';
  if (isAudio) {
    const imp = diskState.device === 'IMPORT' ? c.s.importFiles.find(x => x.name === f.name) : null;
    const canPure = kind === '.WAV' || kind === '.SND';
    c.fw.openWindow('LOAD/SOUND', { file: { name: f.name, size: f.size, bytes: canPure ? bytes : undefined, blob: imp?.blob }, note: defaultNote(c), fromDisk: f.path });
    return;
  }
  if (kind === '.MID' || kind === '.MIDI' || kind === '.SEQ') { c.fw.openWindow('DISK/LOAD_SEQ', { file: f, bytes, into: c.s.seq }); return; }
  if (kind === '.PGM') { c.fw.openWindow('DISK/LOAD_PGM', { file: f, bytes, replace: false }); return; }
  if (kind === '.ALL') { const all = decodeAll(bytes); if (!all) { c.fw.message('NOT AN ALL FILE'); return; } c.fw.confirm({ title: 'Load ALL file', lines: [`File:${f.name}`, '', 'This will replace all existing sequence & songs!'], doItLabel: 'LOAD', doIt: () => { applyAll(c.m, all); c.s.masterTempo = all.masterTempo ?? c.s.masterTempo; c.s.seq = 0; c.s.now = 0; if (diskState.device === 'IMPORT') dropImport(c, f.name); c.fw.message('LOADED'); } }); return; }
  if (kind === '.APS') { const aps = decodeAps(bytes); if (!aps) { c.fw.message('NOT AN APS FILE'); return; } c.fw.confirm({ title: 'Load APS file', lines: [`File:${f.name}`, '', 'This will replace existing programs and sounds'], doItLabel: 'LOAD', doIt: () => { c.m.programs = aps.programs; c.m.drums = aps.drums; c.m.masterPadToNote = aps.masterPadToNote; c.m.sounds = aps.sounds; c.s.sound = 0; if (diskState.device === 'IMPORT') dropImport(c, f.name); c.fw.message('LOADED'); } }); return; }
  if (kind === '.CHOPDECK' || kind === '.ZIP') { const p = decodeProject(bytes); if (!p) { c.fw.message('NOT A PROJECT'); return; } c.fw.confirm({ title: 'Load Project', lines: [`File:${f.name}`, '', 'This will replace EVERYTHING in memory!'], doItLabel: 'LOAD', doIt: () => { Object.assign(c.m, p.machine); c.s.masterTempo = p.masterTempo; c.s.seq = 0; c.s.now = 0; c.s.sound = 0; if (diskState.device === 'IMPORT') dropImport(c, f.name); c.fw.message('PROJECT LOADED'); } }); return; }
  c.fw.message('UNKNOWN FILE TYPE');
}

const wp = (c: Ctx): Record<string, unknown> => { const w = c.s.windows[c.s.windows.length - 1]; if (!w) return {}; if (!w.params) w.params = {}; return w.params; };

export const loadSeqWindow: ScreenDef = {
  id: 'DISK/LOAD_SEQ', title: 'Load a Sequence',
  fields: () => [intField({ id: 'into', row: 4, col: 10, width: 2, label: 'Load into:', min: 1, max: NUM_SEQUENCES, get: c => ((wp(c).into as number) ?? c.s.seq) + 1, set: (c, v) => { wp(c).into = v - 1; }, fmt: pad2 })],
  draw(c, f) { const file = wp(c).file as DiskFile; text(f, 3, 2, `File:${file.name.toUpperCase()}`); const into = (wp(c).into as number) ?? c.s.seq; text(f, 4, 13, `-${c.m.sequences[into].used ? c.m.sequences[into].name : `(${c.m.sequences[into].name})`}`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'DSCARD', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'KEEP', kind: 'action', press: c => {
      const bytes = wp(c).bytes as Uint8Array; const file = wp(c).file as DiskFile; const into = (wp(c).into as number) ?? c.s.seq;
      const seq = ext(file.name) === '.SEQ' ? decodeSeq(bytes) : decodeSmf(bytes, into);
      if (!seq) { c.fw.message('BAD SEQUENCE FILE'); return; }
      c.m.sequences[into] = { ...newSequence(into, c.m.defaults), ...seq, used: true };
      c.s.seq = into; c.s.now = 0;
      if (diskState.device === 'IMPORT') dropImport(c, file.name);
      c.fw.closeWindow(); c.fw.message(`LOADED INTO SQ ${pad2(into + 1)}`);
    } }, null],
};

export const loadPgmWindow: ScreenDef = {
  id: 'DISK/LOAD_PGM', title: 'Load a Program',
  fields: () => [boolField({ id: 'replace', row: 4, col: 30, width: 3, label: 'Replace same sound in memory:', style: 'YES', get: c => !!wp(c).replace, set: (c, v) => { wp(c).replace = v; } })],
  draw(c, f) { const file = wp(c).file as DiskFile; text(f, 3, 2, `File:${file.name.toUpperCase()}`); text(f, 5, 2, 'CLEAR erases all programs and sounds first.', ATTR_DIM); },
  softKeys: () => {
    const load = (c: Ctx, clear: boolean) => {
      const d = decodePgm(wp(c).bytes as Uint8Array); if (!d) { c.fw.message('BAD PROGRAM FILE'); return; }
      if (clear) { c.m.sounds = []; c.m.programs = c.m.programs.map((_, i) => newProgram(i)); }
      mergeSounds(c.m, d.sounds, !!wp(c).replace);
      let i = c.m.programs.findIndex(p => !p.used); if (i < 0) i = c.m.drums[c.s.drum].pgm;
      c.m.programs[i] = { ...d.program, used: true }; c.m.drums[c.s.drum].pgm = i; c.s.program = i;
      if (diskState.device === 'IMPORT') dropImport(c, (wp(c).file as DiskFile).name);
      c.fw.closeWindow(); c.fw.message(d.missing.length ? `LOADED, ${d.missing.length} SOUNDS MISSING` : `LOADED AS PGM ${i + 1}`);
    };
    return [null, null, { label: 'CLEAR', kind: 'action', press: c => load(c, true) }, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() }, { label: 'LOAD', kind: 'action', press: c => load(c, false) }, null];
  },
};

// ---------- Directory window ----------
export const directoryWindow: ScreenDef = {
  id: 'DISK/DIRECTORY', title: 'Directory',
  fields: () => [{ id: 'sel', row: 2, col: 2, width: 1, get: () => '', wheel: (c, d) => { const n = shown(c).length; c.s.diskIndex = n ? clamp(c.s.diskIndex + d, 0, n - 1) : 0; } }],
  draw(c, f) {
    const list = shown(c); const top = clamp(c.s.diskIndex - 2, 0, Math.max(0, list.length - 4));
    text(f, 2, 24, `:${c.s.diskFolder || 'ROOT'}`.slice(0, 22), ATTR_DIM);
    for (let r = 0; r < 4; r++) { const e = list[top + r]; if (!e) break; const row = 2 + r; const label = (e.type === 'DIR' ? `[${e.name}]` : e.name.toUpperCase()).padEnd(20, ' ').slice(0, 20); text(f, row, 3, label, top + r === c.s.diskIndex ? ATTR_INVERSE : e.type === 'DIR' ? 0 : ATTR_DIM); }
    if (!list.length) text(f, 3, 3, '(empty folder)', ATTR_DIM);
    text(f, 6, 2, 'RIGHT opens a folder, LEFT goes up.', ATTR_DIM);
  },
  softKeys: () => [null,
    { label: 'DELETE', kind: 'action', press: c => { const e = current(c); if (!e || e.name === '..') return; c.fw.confirm({ title: e.type === 'DIR' ? 'Delete Folder' : 'Delete File', lines: [`${e.type === 'DIR' ? 'Folder' : 'File'}:${e.name}`, '', `Pressing DO IT will delete selected ${e.type === 'DIR' ? 'folder and its files' : 'file'}!!`], doIt: () => { void (async () => { if (diskState.device === 'IMPORT') dropImport(c, e.name); else await drive.remove(e.path); await refresh(c); })(); },
      extra: { index: 2, label: 'ALL', run: () => c.fw.openWindow('DISK/DELETE_ALL') } }); } },
    { label: 'RENAME', kind: 'action', press: c => { const e = current(c); if (!e || e.name === '..' || diskState.device === 'IMPORT') return; c.fw.editName(e.name.replace(/\.[^.]+$/, ''), n => { void (async () => { const dot = e.type === 'DIR' ? '' : ext(e.name).toLowerCase(); await drive.rename(e.path, `${n.trim() || e.name}${dot}`); await refresh(c); })(); }); } },
    { label: 'Close', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'NEW', kind: 'action', press: c => { if (diskState.device === 'IMPORT') return; c.fw.editName('Folder', n => { void (async () => { await drive.mkdir(c.s.diskFolder, n.trim() || 'Folder'); await refresh(c); })(); }); } },
    null],
  onKey(c, k, down) {
    if (!down) return false;
    const list = shown(c);
    if (k === 'UP' || k === 'DOWN') { c.s.diskIndex = clamp(c.s.diskIndex + (k === 'DOWN' ? 1 : -1), 0, Math.max(0, list.length - 1)); return true; }
    if (k === 'RIGHT') { const e = current(c); if (e?.type === 'DIR' && e.name !== '..') { c.s.diskFolder = e.path; c.s.diskIndex = 0; void refresh(c); } return true; }
    if (k === 'LEFT') { if (c.s.diskFolder) { c.s.diskFolder = parentOf(c.s.diskFolder); c.s.diskIndex = 0; void refresh(c); } return true; }
    return false;
  },
};
const DEL_TYPES = ['ALL FILES', '.SND', '.PGM', '.APS', '.MID', '.ALL', '.WAV', '.SEQ'] as const;
export const deleteAllWindow: ScreenDef = {
  id: 'DISK/DELETE_ALL', title: 'Delete ALL files',
  fields: () => [enumField({ id: 'type', row: 3, col: 8, width: 9, label: 'Delete:', values: DEL_TYPES, get: c => ((wp(c).type as typeof DEL_TYPES[number]) ?? 'ALL FILES'), set: (c, v) => { wp(c).type = v; } })],
  draw(c, f) { text(f, 5, 2, `in folder :${c.s.diskFolder || 'ROOT'}  (folders are kept)`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() }, { label: 'DO IT', kind: 'action', press: c => { const t = (wp(c).type as string) ?? 'ALL FILES'; void (async () => { for (const e of entries) if (e.type !== 'DIR' && (t === 'ALL FILES' || ext(e.name) === t)) await drive.remove(e.path); await refresh(c); c.fw.closeAllWindows(); })(); } }, null],
};

// ---------- SAVE ----------
function defaultName(c: Ctx): string {
  switch (diskState.save) {
    case 'Save All Sequences & Songs': return 'ALL_SEQ_SONG';
    case 'Save a Sequence': return seqOf(c).name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 16);
    case 'Save All Program & Sounds': return 'ALL_PGM_SND';
    case 'Save a Program & Sounds': return c.m.programs[c.m.drums[c.s.drum].pgm].name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 16);
    case 'Save a Sound': return (c.m.sounds[c.s.sound]?.name ?? 'SOUND').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 16);
    case 'Save Mixdown (WAV)': return `${(diskState.mixSource === 'SONG' ? c.m.songs[c.s.song].name : seqOf(c).name).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 12)}_MIX`;
    case 'Save Project Bundle': return 'CHOPDECK_PROJECT';
  }
}
function extension(): string {
  switch (diskState.save) {
    case 'Save All Sequences & Songs': return '.ALL';
    case 'Save a Sequence': return diskState.midiType === 'SEQ' ? '.SEQ' : '.MID';
    case 'Save All Program & Sounds': return '.APS';
    case 'Save a Program & Sounds': return '.PGM';
    case 'Save a Sound': return diskState.sndType === 'WAV' ? '.WAV' : '.SND';
    case 'Save Mixdown (WAV)': return '.WAV';
    case 'Save Project Bundle': return '.CHOPDECK';
  }
}
async function encodeSave(c: Ctx): Promise<Uint8Array | null> {
  const m: Machine = c.m;
  switch (diskState.save) {
    case 'Save All Sequences & Songs': return encodeAll(m, c.s.masterTempo);
    case 'Save a Sequence': { const q = seqOf(c); const tempo = q.tempoSource === 'MAS' ? c.s.masterTempo : q.tempo; return diskState.midiType === 'SEQ' ? encodeSeq(q) : encodeSmf(q, diskState.midiType === 'MIDI FILE TYPE 0' ? 0 : 1, tempo); }
    case 'Save All Program & Sounds': return encodeAps(m, diskState.withSounds === 'WITH SOUNDS');
    case 'Save a Program & Sounds': return encodePgm(m, m.programs[m.drums[c.s.drum].pgm], diskState.withSounds === 'WITH SOUNDS');
    case 'Save a Sound': { const s = m.sounds[c.s.sound]; if (!s) return null; return diskState.sndType === 'WAV' ? encodeWav(s.pcm, s.rate) : encodeSnd(s); }
    case 'Save Mixdown (WAV)': { diskState.busy = 'RENDERING...'; c.fw.touch(); try { const r = await bounce(m, diskState.mixSource === 'SONG' ? { song: c.s.song, masterTempo: c.s.masterTempo, drum: c.s.drum } : { seq: c.s.seq, masterTempo: c.s.masterTempo, drum: c.s.drum }); return encodeWav(r.pcm, r.rate); } finally { diskState.busy = ''; } }
    case 'Save Project Bundle': return encodeProject(m, c.s.masterTempo);
  }
}
async function doSave(c: Ctx) {
  const name = `${(diskState.name || defaultName(c)).trim()}${extension()}`;
  const write = async () => {
    let bytes: Uint8Array | null;
    try { bytes = await encodeSave(c); } catch (e) { c.fw.message(`SAVE FAILED: ${e instanceof Error ? e.message : e}`.slice(0, 46)); return; }
    if (!bytes) { c.fw.message('NOTHING TO SAVE'); return; }
    if (diskState.target === 'DOWNLOAD') { c.fw.host.download(name, bytes, name.endsWith('.WAV') ? 'audio/wav' : name.endsWith('.MID') ? 'audio/midi' : 'application/octet-stream'); c.fw.message(`SENT ${name}`.slice(0, 46)); return; }
    await drive.write(c.s.diskFolder, name, bytes);
    await refresh(c);
    c.fw.message(`SAVED ${name} (${bytesStr(bytes.length)})`.slice(0, 46));
  };
  if (diskState.target === 'BROWSER' && entries.some(e => e.name.toUpperCase() === name.toUpperCase())) {
    c.fw.confirm({ title: 'Save', lines: [`File:${name}`, '', 'This file already exists. Replace it?'], doItLabel: 'SAVE', doIt: () => { void write(); } });
    return;
  }
  await write();
}

export const savePage: ScreenDef = {
  id: 'LOAD/SAVE',
  fields: c => {
    const f: Field[] = [
      enumField({ id: 'type', row: 0, col: 5, width: 27, label: 'Type:', values: SAVES, get: () => diskState.save, set: (_x, v) => { diskState.save = v; diskState.name = ''; } }),
      nameField({ id: 'name', row: 1, col: 5, label: 'File:', get: x => diskState.name || defaultName(x), raw: x => diskState.name || defaultName(x), set: (_x, n) => { diskState.name = n.trim(); } }),
      enumField({ id: 'target', row: 2, col: 7, width: 8, label: 'Device:', values: ['BROWSER', 'DOWNLOAD'] as const, get: () => diskState.target, set: (_x, v) => { diskState.target = v; } }),
    ];
    if (diskState.save === 'Save a Sequence') f.push(enumField({ id: 'midi', row: 3, col: 9, width: 16, label: 'Save as:', values: ['MIDI FILE TYPE 0', 'MIDI FILE TYPE 1', 'SEQ'] as const, get: () => diskState.midiType, set: (_x, v) => { diskState.midiType = v; } }));
    if (diskState.save === 'Save All Program & Sounds' || diskState.save === 'Save a Program & Sounds') f.push(enumField({ id: 'with', row: 3, col: 6, width: 12, label: 'Save:', values: ['WITH SOUNDS', 'PROGRAM ONLY'] as const, get: () => diskState.withSounds, set: (_x, v) => { diskState.withSounds = v; } }));
    if (diskState.save === 'Save a Sound') { f.push(enumField({ id: 'snd', row: 3, col: 11, width: 3, label: 'File type:', values: ['WAV', 'SND'] as const, get: () => diskState.sndType, set: (_x, v) => { diskState.sndType = v; } })); f.push({ id: 'which', row: 4, col: 6, width: 20, label: 'Sound:', get: x => x.m.sounds[x.s.sound]?.name ?? '(none)', wheel: (x, d) => { x.s.sound = clamp(x.s.sound + d, 0, Math.max(0, x.m.sounds.length - 1)); diskState.name = ''; } }); }
    if (diskState.save === 'Save Mixdown (WAV)') f.push(enumField({ id: 'src', row: 3, col: 8, width: 8, label: 'Source:', values: ['SEQUENCE', 'SONG'] as const, get: () => diskState.mixSource, set: (_x, v) => { diskState.mixSource = v; diskState.name = ''; } }));
    void c;
    return f;
  },
  draw(c, f) {
    text(f, 1, 22, extension(), ATTR_DIM);
    text(f, 2, 24, diskState.target === 'BROWSER' ? `to :${c.s.diskFolder || 'ROOT'}` : 'to your computer', ATTR_DIM);
    if (diskState.save === 'Save Mixdown (WAV)') text(f, 4, 0, diskState.mixSource === 'SONG' ? `Song ${pad2(c.s.song + 1)}-${c.m.songs[c.s.song].name}` : `Sq ${pad2(c.s.seq + 1)}-${seqOf(c).name}, one pass, loop off`, ATTR_DIM);
    if (diskState.save === 'Save a Program & Sounds') text(f, 4, 0, `Pgm ${pad2(c.m.drums[c.s.drum].pgm + 1)}-${c.m.programs[c.m.drums[c.s.drum].pgm].name}`, ATTR_DIM);
    if (diskState.save === 'Save a Sequence') text(f, 4, 0, `Sq ${pad2(c.s.seq + 1)}-${seqOf(c).name}`, ATTR_DIM);
    text(f, 5, 0, diskState.busy || `Disk used: ${bytesStr(usage)}`, diskState.busy ? 0 : ATTR_DIM);
  },
  softKeys: footer('SAVE'),
  onEnter(c) { void refresh(c); },
};

export const formatPage: ScreenDef = {
  id: 'LOAD/FORMAT',
  fields: () => [],
  draw(c, f) { text(f, 0, 0, 'Device:BROWSER   Type:IndexedDB'); text(f, 2, 0, 'THIS WILL ERASE THE WHOLE BROWSER DISK!!'); text(f, 4, 0, `Disk used: ${bytesStr(usage)}   ${entries.length} entries in :${c.s.diskFolder || 'ROOT'}`.slice(0, 48), ATTR_DIM); },
  softKeys: footer('FORMAT'),
};

export const saveEntry: ScreenDef = { id: 'SAVE', fields: () => [], draw() {}, softKeys: footer('SAVE'), onEnter(c) { c.fw.setMode('LOAD', 'SAVE'); } };

export const diskScreens: ScreenDef[] = [loadPage, savePage, formatPage, saveEntry, loadSeqWindow, loadPgmWindow, directoryWindow, deleteAllWindow];
export type { FileType };
