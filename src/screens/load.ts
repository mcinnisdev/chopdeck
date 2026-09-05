// LOAD mode (Phase 1: the import tray). Files dropped on the machine or picked with PICK appear in the
// File: list; DO IT opens "Load a Sound". Phase 4 adds the browser disk as another Device.
import { ScreenDef, Ctx } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { NOTE_MIN, NOTE_MAX, Sound } from '@/model/types';
import { newSound } from '@/model/factory';
import { notePad, bytesStr, rpad } from '@/model/format';
import { enumField } from './util';
import { decodeWav } from '@/disk/wav';
import { decodeSnd } from '@/disk/formats';

const VIEWS = ['ALL Files', '.WAV', '.AIF', '.MP3', '.FLAC', '.OGG'] as const;
type View = typeof VIEWS[number];

const ext = (name: string) => { const i = name.lastIndexOf('.'); return i >= 0 ? name.slice(i).toUpperCase() : ''; };
const shown = (c: Ctx, view: View) => c.s.importFiles.filter(f => view === 'ALL Files' || ext(f.name).startsWith(view.slice(0, 4)));
let view: View = 'ALL Files';

function currentFile(c: Ctx) { const list = shown(c, view); return list[Math.min(c.s.importIndex, list.length - 1)]; }

function programMap(c: Ctx) { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; }

export const loadScreen: ScreenDef = {
  id: 'LOAD',
  fields: () => [
    enumField({ id: 'view', row: 0, col: 5, width: 9, label: 'View:', values: VIEWS, get: () => view, set: (c, v) => { view = v; c.s.importIndex = 0; } }),
    { id: 'file', row: 1, col: 5, width: 20, label: 'File:', get: c => currentFile(c)?.name.toUpperCase() ?? '(no files)',
      wheel: (c, d) => { const n = shown(c, view).length; c.s.importIndex = n ? Math.max(0, Math.min(n - 1, c.s.importIndex + d)) : 0; } },
    enumField({ id: 'device', row: 2, col: 7, width: 8, label: 'Device:', values: ['IMPORT'] as const, get: () => 'IMPORT', set: () => {} }),
  ],
  draw(c, f) {
    const file = currentFile(c);
    text(f, 0, 27, `:IMPORT (${c.s.importFiles.length} files)`, ATTR_DIM);
    if (file) text(f, 1, 27, `Size=${bytesStr(file.size).padStart(6, ' ')}`);
    const sndBytes = c.m.sounds.reduce((a, s) => a + s.length * s.channels * 2, 0);
    text(f, 2, 22, `Free memory snd=${rpad(bytesStr(Math.max(0, 32 * 1024 * 1024 - sndBytes)), 7)}`);
    text(f, 3, 0, `Type=${file ? ext(file.name).slice(1) || 'FILE' : '----'}`);
    text(f, 3, 38, `seq= 2.6M`);
    text(f, 5, 0, 'Drop audio files on the machine or press PICK.', ATTR_DIM);
  },
  softKeys: c => [
    { label: 'LOAD', kind: 'current' },
    { label: 'SAVE', kind: 'page', press: x => x.fw.setMode('SAVE') },
    null,
    { label: 'PICK', kind: 'action', press: x => x.fw.host.pickFiles() },
    null,
    { label: 'DO IT', kind: 'action', press: x => { const file = currentFile(x); if (file) x.fw.openWindow('LOAD/SOUND', { file, note: defaultNote(x) }); } },
  ],
  onEnter(c) { void c; },
};

export function defaultNote(c: Ctx): number {
  // first note of the current program without a sound, following the pad order
  const pg = c.m.programs[c.m.drums[c.s.drum].pgm];
  const map = programMap(c);
  for (let p = 0; p < map.length; p++) if (!pg.notes[map[p] - NOTE_MIN].snd) return map[p];
  return 0;
}

export interface LoadParams { file: { name: string; size: number; blob?: Blob; bytes?: Uint8Array }; note: number; sound?: Sound; error?: string; decoding?: boolean }
const params = (c: Ctx) => c.s.windows[c.s.windows.length - 1]?.params as unknown as LoadParams;

export const loadSoundWindow: ScreenDef = {
  id: 'LOAD/SOUND', title: 'Load a Sound',
  fields: () => [
    { id: 'note', row: 4, col: 17, width: 20, label: 'Assign to note:', get: c => { const p = params(c); return p.note ? notePad(p.note, programMap(c)) : '--/OFF'; },
      wheel: (c, d) => { const p = params(c); const n = p.note === 0 ? (d > 0 ? NOTE_MIN : 0) : p.note + d; p.note = n < NOTE_MIN ? 0 : Math.min(NOTE_MAX, n); },
      pad: (c, pad) => { params(c).note = programMap(c)[pad]; } },
  ],
  draw(c, f) {
    const p = params(c);
    text(f, 3, 2, `File:${p.file.name.toUpperCase().slice(0, 30)}`);
    if (p.error) text(f, 5, 2, `Can't read this file: ${p.error}`.slice(0, 44), ATTR_DIM);
    else if (!p.sound) text(f, 5, 2, 'Decoding...', ATTR_DIM);
    else text(f, 5, 2, `${p.sound.channels === 2 ? 'STEREO' : 'MONO'}  ${p.sound.rate}Hz  ${(p.sound.length / p.sound.rate).toFixed(2)}s`, ATTR_DIM);
  },
  softKeys: () => [null, null,
    { label: 'PLAY', kind: 'action', press: c => { const p = params(c); if (p.sound) c.fw.sound.playSound(p.sound); } },
    { label: 'DSCARD', kind: 'action', press: c => { const p = params(c); c.s.importFiles = c.s.importFiles.filter(x => x.name !== p.file.name); c.fw.sound.stopAll(); c.fw.closeWindow(); } },
    { label: 'KEEP', kind: 'action', press: c => {
      const p = params(c); if (!p.sound) return;
      c.m.sounds.push(p.sound);
      if (p.note) { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; pg.notes[p.note - NOTE_MIN].snd = p.sound.id; pg.used = true; }
      c.s.importFiles = c.s.importFiles.filter(x => x.name !== p.file.name);
      c.s.importIndex = Math.max(0, Math.min(c.s.importIndex, c.s.importFiles.length - 1));
      c.fw.sound.stopAll();
      c.fw.closeWindow();
    } },
    null],
  onEnter(c) {
    const p = params(c);
    if (p.sound || p.decoding) return;
    p.decoding = true;
    const base = p.file.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9 _\-#&.]/g, '_').slice(0, 16) || 'SOUND';
    if (p.file.bytes) {
      // disk files decode without the audio engine
      if (/\.snd$/i.test(p.file.name)) { const s = decodeSnd(p.file.bytes); if (s) p.sound = s; else p.error = 'not a sound file'; }
      else { const d = decodeWav(p.file.bytes); if (d) p.sound = newSound(base, d.pcm, d.rate); else if (!p.file.blob) p.error = 'unsupported wav'; }
      // a WAV the pure decoder cannot read falls through to the browser decoder when the original file is at hand
      if (p.sound || p.error || !p.file.blob) { p.decoding = false; c.fw.touch(); return; }
    }
    c.fw.sound.decode(p.file.blob!).then(({ pcm, rate }) => {
      p.sound = newSound(base || 'SOUND', pcm, rate);
      p.decoding = false; c.fw.touch();
    }).catch((e: unknown) => { p.error = e instanceof Error ? e.message : String(e); p.decoding = false; c.fw.touch(); });
  },
  onLeave(c) { c.fw.sound.stopAll(); },
};

/** Called by the host when files arrive (drop or picker). */
export function importFiles(c: { s: Ctx['s']; fw: Ctx['fw'] }, files: File[]) {
  const audio = files.filter(f => /\.(wav|aif|aiff|mp3|flac|ogg|m4a|webm|all|aps|pgm|snd|seq|mid|midi|chopdeck|zip)$/i.test(f.name) || f.type.startsWith('audio/'));
  if (!audio.length) return;
  for (const f of audio) c.s.importFiles.push({ name: f.name, size: f.size, blob: f });
  c.s.importIndex = c.s.importFiles.length - audio.length;
  c.fw.setMode('LOAD');
}

export const loadScreens = [loadScreen, loadSoundWindow];
