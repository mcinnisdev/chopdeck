// MIXER mode: STEREO page (level/pan per note for the current pad bank), Channel Settings window, SETUP page.
import { ScreenDef, Ctx, Field } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE, setAttr } from '@/lcd/frame';
import { NOTE_MIN } from '@/model/types';
import { pad2, notePad } from '@/model/format';
import { intField, enumField, boolField, clamp } from './util';

const program = (c: Ctx) => c.m.programs[c.m.drums[c.s.drum].pgm];
const padMap = (c: Ctx) => { const pg = program(c); return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const noteOf = (c: Ctx, ch: number) => padMap(c)[c.s.padBank * 16 + ch];
const paramsOf = (c: Ctx, ch: number) => program(c).notes[noteOf(c, ch) - NOTE_MIN];

// link state (ALL CH) and multi-select live in module scope; they are performance state, not project data
let linkAll = false;
const selected = new Set<number>();

function channelsToEdit(c: Ctx, ch: number): number[] {
  if (linkAll) return Array.from({ length: 16 }, (_, i) => i);
  if (selected.size) return [...selected];
  return [ch];
}
const panStr = (p: number) => (p === 50 ? 'MID' : p < 50 ? `L${String(50 - p).padStart(2, '0')}` : `R${String(p - 50).padStart(2, '0')}`);

function stripFields(c: Ctx): Field[] {
  const fields: Field[] = [];
  for (let ch = 0; ch < 16; ch++) {
    fields.push({
      id: `pan${ch}`, row: 1, col: ch * 3, width: 3,
      get: x => panStr(paramsOf(x, ch).pan),
      wheel: (x, d) => { for (const k of channelsToEdit(x, ch)) { const p = paramsOf(x, k); p.pan = clamp(p.pan + d, 0, 100); } x.fw.sound.mixerChanged(); },
      window: x => x.fw.openWindow('MIXER/CHANNEL', { ch }),
    });
    fields.push({
      id: `lvl${ch}`, row: 5, col: ch * 3, width: 3,
      get: x => String(paramsOf(x, ch).vol).padStart(3, ' '),
      wheel: (x, d) => { for (const k of channelsToEdit(x, ch)) { const p = paramsOf(x, k); p.vol = clamp(p.vol + d, 0, 100); } x.fw.sound.mixerChanged(); },
      enter: (x, digits) => { const v = clamp(parseInt(digits, 10) || 0, 0, 100); for (const k of channelsToEdit(x, ch)) paramsOf(x, k).vol = v; x.fw.sound.mixerChanged(); },
      window: x => x.fw.openWindow('MIXER/CHANNEL', { ch }),
    });
  }
  return fields;
}

// fields are ordered by row: indices 0..15 are the pan row, 16..31 the level row
function currentChannel(c: Ctx): number {
  const i = c.s.cursor['MIXER/STEREO'] ?? 0;
  return i % 16;
}

const pageKeys = (cur: string) => (c: Ctx) => [
  { label: 'STEREO', kind: cur === 'STEREO' ? 'current' : 'page', press: (x: Ctx) => x.fw.setPage('STEREO') },
  { label: 'INDIV', kind: cur === 'INDIV' ? 'current' : 'page', press: (x: Ctx) => x.fw.setPage('INDIV') },
  { label: 'FXsend', kind: cur === 'FXSEND' ? 'current' : 'page', press: (x: Ctx) => x.fw.setPage('FXSEND') },
  { label: 'SETUP', kind: cur === 'SETUP' ? 'current' : 'page', press: (x: Ctx) => x.fw.setPage('SETUP') },
  { label: 'FXedit', kind: cur === 'FXEDIT' ? 'current' : 'page', press: (x: Ctx) => x.fw.setPage('FXEDIT') },
  cur === 'STEREO'
    ? { label: linkAll ? 'CLEAR' : 'ALL CH', kind: 'action', press: () => { linkAll = !linkAll; if (!linkAll) selected.clear(); void c; } }
    : null,
] as (import('@/kernel/screen').SoftKeyDef | null)[];

export const stereoPage: ScreenDef = {
  id: 'MIXER/STEREO',
  fields: stripFields,
  draw(c, f) {
    const pg = program(c);
    const ch = currentChannel(c);
    text(f, 0, 0, `Stereo mix  Pgm:${String(c.m.drums[c.s.drum].pgm + 1).padStart(2, ' ')}-${pg.name.slice(0, 12)}`);
    text(f, 0, 33, `Bank:${'ABCD'[c.s.padBank]}  Drum:${c.s.drum + 1}`);
    for (let i = 0; i < 16; i++) {
      const p = paramsOf(c, i);
      f.graphics.push({ kind: 'fader', row: 2, col: i * 3, rows: 3, cols: 3, value: p.vol / 100 });
      text(f, 6, i * 3, pad2(i + 1), i === ch ? ATTR_INVERSE : (selected.has(i) || linkAll ? ATTR_NONE_LINK : ATTR_DIM));
    }
    if (linkAll) text(f, 0, 27, 'LINK', ATTR_DIM);
  },
  softKeys: pageKeys('STEREO'),
  onPad(c, pad, _vel, down) {
    if (!down) return false;
    const ch = pad % 16;
    if (c.s.shift) { if (selected.has(ch)) selected.delete(ch); else selected.add(ch); }
    else selected.clear();
    const i = c.s.cursor['MIXER/STEREO'] ?? 0;
    c.fw.setCursor('MIXER/STEREO', ch + (i >= 16 ? 16 : 0));
    return false; // still play the pad
  },
  onLeave() { selected.clear(); },
};
const ATTR_NONE_LINK = 0;

export const channelWindow: ScreenDef = {
  id: 'MIXER/CHANNEL', title: 'Channel Settings',
  fields: () => {
    const ch = (c: Ctx) => (c.s.windows[c.s.windows.length - 1]?.params?.ch as number) ?? currentChannel(c);
    return [
      intField({ id: 'vol', row: 4, col: 6, width: 3, label: 'Vol:', min: 0, max: 100, get: c => paramsOf(c, ch(c)).vol, set: (c, v) => { paramsOf(c, ch(c)).vol = v; c.fw.sound.mixerChanged(); } }),
      { id: 'pan', row: 5, col: 6, width: 3, label: 'Pan:', get: c => panStr(paramsOf(c, ch(c)).pan), wheel: (c, d) => { const p = paramsOf(c, ch(c)); p.pan = clamp(p.pan + d, 0, 100); c.fw.sound.mixerChanged(); } },
      intField({ id: 'ivol', row: 4, col: 19, width: 3, label: 'Vol:', min: 0, max: 100, get: c => paramsOf(c, ch(c)).indivVol, set: (c, v) => { paramsOf(c, ch(c)).indivVol = v; } }),
      { id: 'iout', row: 5, col: 19, width: 3, label: 'Out:', get: c => { const o = paramsOf(c, ch(c)).indivOut; return o === 0 ? ' - ' : String(o).padStart(3, ' '); }, wheel: (c, d) => { const p = paramsOf(c, ch(c)); p.indivOut = clamp(p.indivOut + d, 0, 8); } },
      enumField({ id: 'fx', row: 4, col: 28, width: 3, values: ['OFF', 'M1', 'M2', 'R1', 'R2'] as const, get: c => paramsOf(c, ch(c)).fxBus, set: (c, v) => { paramsOf(c, ch(c)).fxBus = v; } }),
      intField({ id: 'send', row: 5, col: 28, width: 3, min: 0, max: 100, get: c => paramsOf(c, ch(c)).fxSend, set: (c, v) => { paramsOf(c, ch(c)).fxSend = v; } }),
      boolField({ id: 'follow', row: 5, col: 40, width: 3, style: 'YES', get: c => paramsOf(c, ch(c)).followStereo, set: (c, v) => { paramsOf(c, ch(c)).followStereo = v; } }),
    ];
  },
  draw(c, f) {
    const ch = (c.s.windows[c.s.windows.length - 1]?.params?.ch as number) ?? currentChannel(c);
    const note = noteOf(c, ch);
    const snd = c.m.sounds.find(s => s.id === paramsOf(c, ch).snd)?.name ?? 'OFF';
    text(f, 2, 2, `Note:${notePad(note, padMap(c))}-${snd}`);
    text(f, 3, 2, 'STEREO', ATTR_DIM); text(f, 3, 15, 'INDIV', ATTR_DIM); text(f, 3, 28, 'FX', ATTR_DIM); text(f, 3, 36, 'Follow', ATTR_DIM);
    text(f, 4, 36, 'stereo:', ATTR_DIM);
  },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
};

export const setupPage: ScreenDef = {
  id: 'MIXER/SETUP',
  fields: () => [
    enumField({ id: 'stsrc', row: 1, col: 18, width: 7, label: 'Stereo mix source:', values: ['PROGRAM', 'DRUM'] as const, get: () => 'PROGRAM', set: () => {} }),
    enumField({ id: 'fxsrc', row: 2, col: 18, width: 7, label: 'INDIV/FX source:', values: ['PROGRAM', 'DRUM'] as const, get: () => 'PROGRAM', set: () => {} }),
    boolField({ id: 'copy', row: 3, col: 21, width: 3, label: 'Copy pgm mix to drum:', style: 'YES', get: () => true, set: () => {} }),
    boolField({ id: 'recmix', row: 4, col: 21, width: 3, label: 'Record mix changes:', style: 'YES', get: c => c.m.recordMixChanges, set: (c, v) => { c.m.recordMixChanges = v; } }),
    intField({ id: 'master', row: 1, col: 33, width: 5, min: -24, max: 12, get: c => c.m.masterLevelDb, set: (c, v) => { c.m.masterLevelDb = v; c.fw.sound.mixerChanged(); }, fmt: v => `${v >= 0 ? '+' : ''}${v}dB`.padStart(5, ' ') }),
    intField({ id: 'fxdrum', row: 4, col: 38, width: 1, label: 'Drum:', min: 1, max: 4, get: c => c.s.drum + 1, set: (c, v) => { c.s.drum = v - 1; } }),
  ],
  draw(c, f) {
    text(f, 0, 0, 'Mixer setup');
    text(f, 0, 28, 'Master Level', ATTR_DIM);
    text(f, 3, 28, 'FX drum', ATTR_DIM);
    void c;
  },
  softKeys: pageKeys('SETUP'),
};

function stub(page: string, title: string): ScreenDef {
  return {
    id: `MIXER/${page}`, fields: () => [],
    draw(c, f) { text(f, 0, 0, title); text(f, 3, 0, 'Needs the effects board (Phase 5).', ATTR_DIM); void c; },
    softKeys: pageKeys(page),
  };
}

export const mixerEntry: ScreenDef = {
  id: 'MIXER',
  fields: () => [], draw() {},
  softKeys: pageKeys('STEREO'),
  onEnter(c) { c.fw.setPage('STEREO'); },
};

export const mixerScreens: ScreenDef[] = [mixerEntry, stereoPage, channelWindow, setupPage, stub('INDIV', 'Individual outputs'), stub('FXSEND', 'Effect send'), stub('FXEDIT', 'Effect edit')];
void setAttr;
