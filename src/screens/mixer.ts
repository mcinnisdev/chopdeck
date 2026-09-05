// MIXER mode: STEREO page (level/pan per note for the current pad bank), Channel Settings window, SETUP page.
import { ScreenDef, Ctx, Field } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE, setAttr } from '@/lcd/frame';
import { NOTE_MIN } from '@/model/types';
import { pad2, notePad } from '@/model/format';
import { intField, enumField, boolField, clamp, cycle } from './util';

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

// ---------- FXsend page: bus + send level per strip ----------
const FX_BUSES = ['OFF', 'M1', 'M2', 'R1', 'R2'] as const;
export const fxSendPage: ScreenDef = {
  id: 'MIXER/FXSEND',
  fields: () => {
    const fields: Field[] = [];
    for (let ch = 0; ch < 16; ch++) {
      fields.push({ id: `bus${ch}`, row: 1, col: ch * 3, width: 3, get: x => paramsOf(x, ch).fxBus.padEnd(3, ' '),
        wheel: (x, d) => { for (const k of channelsToEdit(x, ch)) { const p = paramsOf(x, k); p.fxBus = cycle(FX_BUSES, p.fxBus, d); } x.fw.sound.mixerChanged(); } });
      fields.push({ id: `snd${ch}`, row: 5, col: ch * 3, width: 3, get: x => String(paramsOf(x, ch).fxSend).padStart(3, ' '),
        wheel: (x, d) => { for (const k of channelsToEdit(x, ch)) { const p = paramsOf(x, k); p.fxSend = clamp(p.fxSend + d, 0, 100); } x.fw.sound.mixerChanged(); },
        enter: (x, digits) => { const v = clamp(parseInt(digits, 10) || 0, 0, 100); for (const k of channelsToEdit(x, ch)) paramsOf(x, k).fxSend = v; x.fw.sound.mixerChanged(); } });
    }
    return fields;
  },
  draw(c, f) {
    text(f, 0, 0, `FX send    Pgm:${String(c.m.drums[c.s.drum].pgm + 1).padStart(2, ' ')}-${program(c).name.slice(0, 12)}`);
    text(f, 0, 33, `Bank:${'ABCD'[c.s.padBank]}  Drum:${c.s.drum + 1}`);
    const ch = (c.s.cursor['MIXER/FXSEND'] ?? 0) % 16;
    for (let i = 0; i < 16; i++) { f.graphics.push({ kind: 'fader', row: 2, col: i * 3, rows: 3, cols: 3, value: paramsOf(c, i).fxSend / 100 }); text(f, 6, i * 3, pad2(i + 1), i === ch ? ATTR_INVERSE : ATTR_DIM); }
  },
  softKeys: pageKeys('FXSEND'),
  onPad(c, pad, _v, down) { if (!down) return false; const ch = pad % 16; const i = c.s.cursor['MIXER/FXSEND'] ?? 0; c.fw.setCursor('MIXER/FXSEND', ch + (i >= 16 ? 16 : 0)); return false; },
};

// ---------- FXedit page and module windows ----------
type FxSel = 'MULTI FX1' | 'MULTI FX2' | 'REVERB 1' | 'REVERB 2';
const FX_SELS: readonly FxSel[] = ['MULTI FX1', 'MULTI FX2', 'REVERB 1', 'REVERB 2'];
let fxSel: FxSel = 'MULTI FX1';
const multiOf = (c: Ctx) => (fxSel === 'MULTI FX2' ? c.m.fx.m2 : c.m.fx.m1);
const reverbOf = (c: Ctx) => (fxSel === 'REVERB 1' ? c.m.fx.r1 : fxSel === 'REVERB 2' ? c.m.fx.r2 : multiOf(c).rev);
const MODULES = ['DIST', 'FILT', 'MOD', 'ECHO', 'REV', 'MIX'] as const;
type Mod = typeof MODULES[number];
const moduleOn = (c: Ctx, m: Mod) => { const x = multiOf(c); return m === 'DIST' ? x.dist.on : m === 'FILT' ? x.filt.on : m === 'MOD' ? x.mod.on : m === 'ECHO' ? x.echo.on : m === 'REV' ? x.rev.on : x.mix.on; };
const setModuleOn = (c: Ctx, m: Mod, on: boolean) => { const x = multiOf(c); if (m === 'DIST') x.dist.on = on; else if (m === 'FILT') x.filt.on = on; else if (m === 'MOD') x.mod.on = on; else if (m === 'ECHO') x.echo.on = on; else if (m === 'REV') x.rev.on = on; else x.mix.on = on; c.fw.sound.mixerChanged(); };
const touchFx = (c: Ctx) => c.fw.sound.mixerChanged();
const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`.padStart(3, ' ');

export const fxEditPage: ScreenDef = {
  id: 'MIXER/FXEDIT',
  fields: () => {
    const f: Field[] = [enumField({ id: 'sel', row: 0, col: 5, width: 9, label: 'Edit:', values: FX_SELS, get: () => fxSel, set: (_c, v) => { fxSel = v; } })];
    if (fxSel.startsWith('MULTI')) MODULES.forEach((m, i) => f.push({ id: `mod${m}`, row: 2, col: 1 + i * 8, width: 4, get: () => m, wheel: (c, d) => setModuleOn(c, m, d > 0), window: c => c.fw.openWindow(`MIXER/FX_${m}`) }));
    else f.push(...reverbFields(2));
    return f;
  },
  draw(c, f) {
    text(f, 0, 20, `Drum:${c.s.drum + 1}  Pgm:${program(c).name.slice(0, 12)}`, ATTR_DIM);
    if (fxSel.startsWith('MULTI')) {
      MODULES.forEach((m, i) => { const on = moduleOn(c, m); text(f, 1, 1 + i * 8, on ? '[ON ]' : '[OFF]', on ? 0 : ATTR_DIM); if (i < MODULES.length - 1) text(f, 2, 6 + i * 8, '->', ATTR_DIM); });
      text(f, 4, 0, 'DATA on a module: ON/OFF.  OPEN WINDOW: its parameters.', ATTR_DIM);
      const x = multiOf(c);
      text(f, 5, 0, `${x.mod.type}  ${x.echo.type} ${x.echo.delayMs}ms  ${x.rev.type}`.slice(0, 48), ATTR_DIM);
    }
    text(f, 6, 0, 'Sends: MIXER > FXsend.  Returns go to the stereo out.', ATTR_DIM);
  },
  softKeys: c => [...pageKeys('FXEDIT')(c).slice(0, 5), fxSel.startsWith('MULTI') ? { label: 'ON/OFF', kind: 'action', press: x => { const id = x.s.cursor['MIXER/FXEDIT'] ?? 0; const m = MODULES[id - 1]; if (m) setModuleOn(x, m, !moduleOn(x, m)); } } : null],
};

function reverbFields(row: number): Field[] {
  return [
    enumField({ id: 'rtype', row, col: 5, width: 10, label: 'Type:', values: ['LARGE HALL', 'SMALL HALL', 'LARGE ROOM', 'SMALL ROOM', 'GATED 1', 'GATED 2', 'REVERSE'] as const, get: c => reverbOf(c).type, set: (c, v) => { reverbOf(c).type = v; touchFx(c); } }),
    intField({ id: 'pre', row: row + 1, col: 9, width: 3, label: 'Predelay:', min: 0, max: 200, get: c => reverbOf(c).predelayMs, set: (c, v) => { reverbOf(c).predelayMs = v; touchFx(c); } }),
    intField({ id: 'time', row: row + 1, col: 22, width: 3, label: 'Time:', min: 0, max: 100, get: c => reverbOf(c).time, set: (c, v) => { reverbOf(c).time = v; touchFx(c); } }),
    intField({ id: 'diff', row: row + 2, col: 8, width: 3, label: 'Diffuse:', min: 0, max: 100, get: c => reverbOf(c).diffuse, set: (c, v) => { reverbOf(c).diffuse = v; touchFx(c); } }),
    intField({ id: 'hf', row: row + 2, col: 26, width: 3, label: 'HF damping:', min: 0, max: 100, get: c => reverbOf(c).hfDamp, set: (c, v) => { reverbOf(c).hfDamp = v; touchFx(c); } }),
    intField({ id: 'lvl', row: row + 3, col: 6, width: 3, label: 'Level:', min: 0, max: 100, get: c => reverbOf(c).level, set: (c, v) => { reverbOf(c).level = v; touchFx(c); } }),
    boolField({ id: 'on', row: row + 3, col: 17, width: 3, label: 'ON:', get: c => reverbOf(c).on, set: (c, v) => { reverbOf(c).on = v; touchFx(c); } }),
  ];
}
const closeKey = (): (import('@/kernel/screen').SoftKeyDef | null)[] => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null];
const win = (id: string, title: string, fields: (c: Ctx) => Field[]): ScreenDef => ({ id, title, fields, draw() {}, softKeys: closeKey });

export const fxWindows: ScreenDef[] = [
  win('MIXER/FX_DIST', 'DISTORTION/RING MOD', () => [
    intField({ id: 'gain', row: 2, col: 6, width: 3, label: 'Gain:', min: 0, max: 100, get: c => multiOf(c).dist.gain, set: (c, v) => { multiOf(c).dist.gain = v; touchFx(c); } }),
    intField({ id: 'lvl', row: 2, col: 18, width: 3, label: 'Level:', min: 0, max: 100, get: c => multiOf(c).dist.level, set: (c, v) => { multiOf(c).dist.level = v; touchFx(c); } }),
    intField({ id: 'rf', row: 3, col: 6, width: 5, label: 'Freq:', min: 20, max: 5000, step: 10, get: c => multiOf(c).dist.ringFreq, set: (c, v) => { multiOf(c).dist.ringFreq = v; touchFx(c); } }),
    intField({ id: 'rd', row: 3, col: 18, width: 3, label: 'Depth:', min: 0, max: 100, get: c => multiOf(c).dist.ringDepth, set: (c, v) => { multiOf(c).dist.ringDepth = v; touchFx(c); } }),
    boolField({ id: 'on', row: 5, col: 3, width: 3, label: 'ON:', get: c => multiOf(c).dist.on, set: (c, v) => setModuleOn(c, 'DIST', v) }),
  ]),
  win('MIXER/FX_FILT', '4-BAND FILTER', () => [
    intField({ id: 'low', row: 2, col: 5, width: 3, label: 'LOW:', min: -12, max: 12, get: c => multiOf(c).filt.low, set: (c, v) => { multiOf(c).filt.low = v; touchFx(c); }, fmt: signed }),
    intField({ id: 'm1', row: 3, col: 6, width: 3, label: 'MID1:', min: -12, max: 12, get: c => multiOf(c).filt.mid1, set: (c, v) => { multiOf(c).filt.mid1 = v; touchFx(c); }, fmt: signed }),
    intField({ id: 'm1f', row: 3, col: 12, width: 5, label: '@', min: 50, max: 10000, step: 10, get: c => multiOf(c).filt.mid1Freq, set: (c, v) => { multiOf(c).filt.mid1Freq = v; touchFx(c); } }),
    intField({ id: 'm2', row: 4, col: 6, width: 3, label: 'MID2:', min: -12, max: 12, get: c => multiOf(c).filt.mid2, set: (c, v) => { multiOf(c).filt.mid2 = v; touchFx(c); }, fmt: signed }),
    intField({ id: 'm2f', row: 4, col: 12, width: 5, label: '@', min: 50, max: 15000, step: 10, get: c => multiOf(c).filt.mid2Freq, set: (c, v) => { multiOf(c).filt.mid2Freq = v; touchFx(c); } }),
    intField({ id: 'high', row: 5, col: 6, width: 3, label: 'HIGH:', min: -12, max: 12, get: c => multiOf(c).filt.high, set: (c, v) => { multiOf(c).filt.high = v; touchFx(c); }, fmt: signed }),
    boolField({ id: 'on', row: 5, col: 20, width: 3, label: 'ON:', get: c => multiOf(c).filt.on, set: (c, v) => setModuleOn(c, 'FILT', v) }),
  ]),
  win('MIXER/FX_MOD', 'MODULATION', () => [
    enumField({ id: 'type', row: 2, col: 6, width: 15, label: 'Type:', values: ['PHASE SHIFT', 'FLANGE', 'CHORUS', 'ROTARY SPEAKERS', 'FMOD/AUTOPAN', 'PITCH SHIFT'] as const, get: c => multiOf(c).mod.type, set: (c, v) => { multiOf(c).mod.type = v; touchFx(c); } }),
    { id: 'speed', row: 3, col: 7, width: 5, label: 'Speed:', get: c => `${multiOf(c).mod.speed.toFixed(2)}`.padStart(5, ' '), wheel: (c, d) => { const m = multiOf(c).mod; m.speed = clamp(Math.round((m.speed + d * 0.05) * 100) / 100, 0.05, 10); touchFx(c); } },
    intField({ id: 'depth', row: 3, col: 20, width: 3, label: 'Depth:', min: 0, max: 100, get: c => multiOf(c).mod.depth, set: (c, v) => { multiOf(c).mod.depth = v; touchFx(c); } }),
    intField({ id: 'fb', row: 4, col: 10, width: 3, label: 'Feedback:', min: 0, max: 100, get: c => multiOf(c).mod.feedback, set: (c, v) => { multiOf(c).mod.feedback = v; touchFx(c); } }),
    boolField({ id: 'on', row: 5, col: 3, width: 3, label: 'ON:', get: c => multiOf(c).mod.on, set: (c, v) => setModuleOn(c, 'MOD', v) }),
  ]),
  win('MIXER/FX_ECHO', 'DELAY/ECHO', () => [
    enumField({ id: 'type', row: 2, col: 6, width: 10, label: 'Type:', values: ['MONO LEFT', 'MONO L+R', 'X-OVER L&R', 'STEREO'] as const, get: c => multiOf(c).echo.type, set: (c, v) => { multiOf(c).echo.type = v; touchFx(c); } }),
    intField({ id: 'delay', row: 3, col: 15, width: 3, label: 'Feedback delay:', min: 0, max: 670, step: 5, get: c => multiOf(c).echo.delayMs, set: (c, v) => { multiOf(c).echo.delayMs = v; touchFx(c); } }),
    intField({ id: 'fb', row: 4, col: 10, width: 3, label: 'Feedback:', min: 0, max: 100, get: c => multiOf(c).echo.feedback, set: (c, v) => { multiOf(c).echo.feedback = v; touchFx(c); } }),
    intField({ id: 'hf', row: 4, col: 27, width: 3, label: 'HF damping:', min: 0, max: 100, get: c => multiOf(c).echo.hfDamp, set: (c, v) => { multiOf(c).echo.hfDamp = v; touchFx(c); } }),
    boolField({ id: 'on', row: 5, col: 3, width: 3, label: 'ON:', get: c => multiOf(c).echo.on, set: (c, v) => setModuleOn(c, 'ECHO', v) }),
  ]),
  win('MIXER/FX_REV', 'REVERB', () => reverbFields(2)),
  win('MIXER/FX_MIX', 'Effect Mixer', () => [
    boolField({ id: 'direct', row: 2, col: 12, width: 3, label: 'Direct sig:', get: c => multiOf(c).mix.direct, set: (c, v) => { multiOf(c).mix.direct = v; touchFx(c); } }),
    intField({ id: 'lvl', row: 3, col: 12, width: 3, label: 'Level:', min: 0, max: 100, get: c => multiOf(c).mix.level, set: (c, v) => { multiOf(c).mix.level = v; touchFx(c); } }),
    boolField({ id: 'on', row: 5, col: 3, width: 3, label: 'ON:', get: c => multiOf(c).mix.on, set: (c, v) => setModuleOn(c, 'MIX', v) }),
  ]),
];

export const mixerEntry: ScreenDef = {
  id: 'MIXER',
  fields: () => [], draw() {},
  softKeys: pageKeys('STEREO'),
  onEnter(c) { c.fw.setPage('STEREO'); },
};

const indivStub: ScreenDef = { id: 'MIXER/INDIV', fields: () => [], draw(c, f) { text(f, 0, 0, 'Individual outputs'); text(f, 3, 0, 'The browser has one stereo output; INDIV is not installed.', ATTR_DIM); void c; }, softKeys: pageKeys('INDIV') };

export const mixerScreens: ScreenDef[] = [mixerEntry, stereoPage, channelWindow, setupPage, indivStub, fxSendPage, fxEditPage, ...fxWindows];
void setAttr;
