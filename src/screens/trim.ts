// TRIM mode: the sound editor. TRIM / LOOP / ZONE / PARAMS pages, fine windows with zoom, the EDIT window
// (discard, section ops, time stretch, slice to program) and the Sound window (delete, copy, convert, resample).
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM, LcdFrame } from '@/lcd/frame';
import { Sound, NOTE_MIN, MAX_ZONES } from '@/model/types';
import { newSound, newProgram } from '@/model/factory';
import { intField, enumField, boolField, nameField, clamp, cycle } from './util';
import {
  discard, deleteSection, silence, reverse, insert, normalize, resample, bitReduce, timeStretch, STRETCH_PRESETS,
  equalZones, sliceZones, regionTempo, toMono, slice, ResampleQuality,
} from '@/audio/dsp';

// ---------- page state (performance state, not project data) ----------
type Order = 'MEM' | 'SIZE' | 'NAME';
type PlayX = 'ALL' | 'ZONE' | 'BEFOR ST' | 'BEFORE TO' | 'AFTR END';
const PLAY_X: readonly PlayX[] = ['ALL', 'ZONE', 'BEFOR ST', 'BEFORE TO', 'AFTR END'];
const st = { order: 'MEM' as Order, playX: 'ALL' as PlayX, zone: 0, view: 'LEFT' as 'LEFT' | 'RIGHT' };
const envCache = new Map<string, Float32Array>();

const wp = (c: Ctx): Record<string, unknown> => { const w = c.s.windows[c.s.windows.length - 1]; if (!w) return {}; if (!w.params) w.params = {}; return w.params; };
const num = (c: Ctx, k: string, d: number) => (typeof wp(c)[k] === 'number' ? (wp(c)[k] as number) : d);
const str = (c: Ctx, k: string, d: string) => (typeof wp(c)[k] === 'string' ? (wp(c)[k] as string) : d);
const bool = (c: Ctx, k: string, d: boolean) => (typeof wp(c)[k] === 'boolean' ? (wp(c)[k] as boolean) : d);
const setP = (c: Ctx, k: string, v: unknown) => { wp(c)[k] = v; };

export const sndOf = (c: Ctx): Sound | null => c.m.sounds[clamp(c.s.sound, 0, Math.max(0, c.m.sounds.length - 1))] ?? null;
const program = (c: Ctx) => c.m.programs[c.m.drums[c.s.drum].pgm];
const padMap = (c: Ctx) => { const pg = program(c); return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const fmtFrames = (v: number) => String(Math.round(v)).padStart(8, ' ');
const secs = (frames: number, rate: number) => `${(frames / rate).toFixed(2)}s`;

function orderedIndices(c: Ctx): number[] {
  const idx = c.m.sounds.map((_, i) => i);
  if (st.order === 'SIZE') idx.sort((a, b) => c.m.sounds[b].length - c.m.sounds[a].length);
  if (st.order === 'NAME') idx.sort((a, b) => c.m.sounds[a].name.localeCompare(c.m.sounds[b].name));
  return idx;
}

/** Keep st/end/loop/zones inside the sound after any edit. */
export function clampSound(s: Sound): void {
  s.end = clamp(s.end, 1, s.length); s.st = clamp(s.st, 0, s.end - 1);
  s.loopTo = clamp(s.loopTo, 0, Math.max(0, s.length - 1)); s.loopLength = clamp(s.loopLength, 1, s.length - s.loopTo);
  const z = s.zones.filter(zn => zn.st < zn.end && zn.st >= s.st && zn.end <= s.end);
  s.zones = z.length ? z : equalZones(s.st, s.end, 1);
  st.zone = clamp(st.zone, 0, s.zones.length - 1);
}
export function replacePcm(s: Sound, pcm: Float32Array[]): void {
  s.pcm = pcm; s.length = pcm[0]?.length ?? 0; s.channels = pcm.length === 2 ? 2 : 1;
  clampSound(s);
}
function ensureZones(s: Sound) { if (!s.zones.length || s.zones[0].st < s.st || s.zones[s.zones.length - 1].end > s.end) s.zones = equalZones(s.st, s.end, Math.max(1, s.zones.length)); st.zone = clamp(st.zone, 0, s.zones.length - 1); }

function envelope(s: Sound, points = 480): Float32Array {
  const key = `${s.id}:${s.length}:${st.view}`;
  const hit = envCache.get(key); if (hit) return hit;
  const ch = s.pcm[st.view === 'RIGHT' && s.pcm[1] ? 1 : 0] ?? new Float32Array(0);
  const out = new Float32Array(points);
  const per = Math.max(1, ch.length / points);
  for (let i = 0; i < points; i++) { let m = 0; const a = Math.floor(i * per), b = Math.min(ch.length, Math.floor((i + 1) * per)); for (let j = a; j < b; j++) { const v = Math.abs(ch[j]); if (v > m) m = v; } out[i] = m; }
  if (envCache.size > 64) envCache.clear();
  envCache.set(key, out);
  return out;
}

function drawWave(c: Ctx, f: LcdFrame, sel: [number, number], marks: number[], row = 2, rows = 3, view?: { from: number; to: number }) {
  const s = sndOf(c); if (!s) return;
  const L = Math.max(1, s.length);
  if (!view) { f.graphics.push({ kind: 'waveform', row, col: 0, rows, cols: 48, data: envelope(s), selected: [sel[0] / L, sel[1] / L], marks: marks.map(m => m / L) }); return; }
  // zoomed: envelope of the window only
  const from = clamp(view.from, 0, L), to = clamp(view.to, from + 1, L);
  const ch = s.pcm[st.view === 'RIGHT' && s.pcm[1] ? 1 : 0];
  const pts = 480; const data = new Float32Array(pts); const per = (to - from) / pts;
  for (let i = 0; i < pts; i++) { let m = 0; const a = Math.floor(from + i * per), b = Math.max(a + 1, Math.floor(from + (i + 1) * per)); for (let j = a; j < b && j < L; j++) { const v = Math.abs(ch[j]); if (v > m) m = v; } data[i] = m; }
  const rel = (x: number) => (x - from) / (to - from);
  f.graphics.push({ kind: 'waveform', row, col: 0, rows, cols: 48, data, selected: [clamp(rel(sel[0]), 0, 1), clamp(rel(sel[1]), 0, 1)], marks: marks.map(rel).filter(m => m >= 0 && m <= 1) });
}

/** Audition per PLAY X. */
function audition(c: Ctx, page: string) {
  const s = sndOf(c); if (!s) return;
  const x = st.playX;
  let from = s.st, to = s.end, loop = false;
  if (x === 'ZONE' && page === 'ZONE') { ensureZones(s); from = s.zones[st.zone].st; to = s.zones[st.zone].end; }
  else if (x === 'BEFOR ST') { from = 0; to = s.st; }
  else if (x === 'BEFORE TO') { from = s.st; to = Math.max(s.st + 1, s.loopTo); }
  else if (x === 'AFTR END') { from = s.end; to = s.length; }
  else if (page === 'LOOP' && s.loopOn) { from = s.loopTo; to = s.loopTo + s.loopLength; loop = true; }
  if (to <= from) return;
  c.fw.sound.playSound(s, { from, to, loop });
}

// ---------- common fields ----------
function sndField(): Field {
  return {
    id: 'snd', row: 0, col: 4, width: 20, label: 'Snd:',
    get: c => { const s = sndOf(c); return s ? `${s.name}${s.channels === 2 ? '(ST)' : ''}` : '(none)'; },
    wheel: (c, d) => { const list = orderedIndices(c); if (!list.length) return; const pos = list.indexOf(clamp(c.s.sound, 0, list.length - 1)); c.s.sound = list[clamp(pos + d, 0, list.length - 1)]; st.zone = 0; },
    pad: (c, pad) => { const id = program(c).notes[padMap(c)[pad] - NOTE_MIN]?.snd; const i = c.m.sounds.findIndex(x => x.id === id); if (i >= 0) { c.s.sound = i; st.zone = 0; } },
    window: c => c.fw.openWindow('TRIM/SOUND'),
  };
}
const playXField = (): Field => enumField({ id: 'playx', row: 0, col: 38, width: 9, label: 'PLAY X:', values: PLAY_X, get: () => st.playX, set: (_c, v) => { st.playX = v; } });
const viewField = (): Field => enumField({ id: 'view', row: 1, col: 43, width: 5, label: 'View:', values: ['LEFT', 'RIGHT'] as const, get: () => st.view, set: (_c, v) => { st.view = v; }, hidden: c => (sndOf(c)?.channels ?? 1) !== 2 });

function frameField(o: { id: string; row: number; col: number; label: string; get: (s: Sound) => number; set: (s: Sound, v: number, c: Ctx) => void; window?: string; hidden?: (c: Ctx) => boolean }): Field {
  return {
    id: o.id, row: o.row, col: o.col, width: 8, label: o.label, hidden: o.hidden,
    get: c => { const s = sndOf(c); return s ? fmtFrames(o.get(s)) : '--------'; },
    wheel: (c, d) => { const s = sndOf(c); if (s) { o.set(s, o.get(s) + d, c); clampSound(s); } },
    coarse: 1000,
    enter: (c, digits) => { const s = sndOf(c); const v = parseInt(digits, 10); if (s && !isNaN(v)) { o.set(s, v, c); clampSound(s); } },
    window: o.window ? c => { if (sndOf(c)) c.fw.openWindow(o.window!, { zoom: Math.max(256, Math.floor((sndOf(c)!.length) / 8)) }); } : undefined,
  };
}

const setSt = (s: Sound, v: number) => { s.st = clamp(v, 0, s.end - 1); };
const setEnd = (s: Sound, v: number) => { s.end = clamp(v, s.st + 1, s.length); };
const setTo = (s: Sound, v: number) => { s.loopTo = clamp(v, 0, s.length - 1); s.loopLength = Math.min(s.loopLength, s.length - s.loopTo); };
const setLoopLen = (s: Sound, v: number) => { s.loopLength = clamp(v, 1, s.length - s.loopTo); };
const setLoopEnd = (s: Sound, v: number) => setLoopLen(s, v - s.loopTo);
const zone = (s: Sound) => { ensureZones(s); return s.zones[st.zone]; };
const setZoneSt = (s: Sound, v: number) => { const z = zone(s); const prev = s.zones[st.zone - 1]; const lo = prev ? prev.st + 1 : s.st; z.st = clamp(v, lo, z.end - 1); if (prev) prev.end = z.st; };
const setZoneEnd = (s: Sound, v: number) => { const z = zone(s); const next = s.zones[st.zone + 1]; const hi = next ? next.end - 1 : s.end; z.end = clamp(v, z.st + 1, hi); if (next) next.st = z.end; };

// ---------- pages ----------
const PAGES = ['TRIM', 'LOOP', 'ZONE', 'PARAMS'] as const;
function pageKeys(page: string): (c: Ctx) => (SoftKeyDef | null)[] {
  return () => [
    ...PAGES.map<SoftKeyDef>(p => ({ label: p, kind: p === page ? 'current' : 'page', press: c => { if (p === page) st.order = cycle(['MEM', 'SIZE', 'NAME'] as const, st.order, 1); else c.fw.setPage(p); } })),
    { label: 'EDIT', kind: 'action', press: c => { if (!sndOf(c)) return; if (page === 'LOOP') c.fw.openWindow('TRIM/FIT_LENGTH'); else c.fw.openWindow('TRIM/EDIT', { fromZone: page === 'ZONE', op: page === 'ZONE' ? 'SLICE SOUND' : 'DISCARD' }); } },
    { label: 'PLAY X', kind: 'action', press: c => audition(c, page), release: c => c.fw.sound.stopAll() },
  ];
}
function header(c: Ctx, f: LcdFrame) {
  text(f, 0, 25, `[${st.order}]`, ATTR_DIM);
  if (!sndOf(c)) text(f, 3, 0, 'No sounds in memory. Load or sample one.', ATTR_DIM);
}
const noSound = (c: Ctx) => !sndOf(c);

export const trimPage: ScreenDef = {
  id: 'TRIM/TRIM',
  fields: c => (noSound(c) ? [sndField()] : [
    sndField(), playXField(),
    frameField({ id: 'st', row: 1, col: 3, label: 'St:', get: s => s.st, set: setSt, window: 'TRIM/ST_FINE' }),
    frameField({ id: 'end', row: 1, col: 17, label: 'End:', get: s => s.end, set: setEnd, window: 'TRIM/END_FINE' }),
    viewField(),
  ]),
  draw(c, f) {
    header(c, f); const s = sndOf(c); if (!s) return;
    drawWave(c, f, [s.st, s.end], []);
    text(f, 5, 0, `Lngth=${fmtFrames(s.end - s.st)} (${secs(s.end - s.st, s.rate)})  ${s.rate}Hz`, ATTR_DIM);
  },
  softKeys: pageKeys('TRIM'),
  onEnter(c) { c.s.sound = clamp(c.s.sound, 0, Math.max(0, c.m.sounds.length - 1)); },
};

export const loopPage: ScreenDef = {
  id: 'TRIM/LOOP',
  fields: c => (noSound(c) ? [sndField()] : [
    sndField(), playXField(),
    frameField({ id: 'to', row: 1, col: 3, label: 'To:', get: s => s.loopTo, set: setTo, window: 'TRIM/TO_FINE' }),
    frameField({ id: 'lngth', row: 1, col: 18, label: 'Lngth:', get: s => s.loopLength, set: setLoopLen, window: 'TRIM/LOOPEND_FINE' }),
    boolField({ id: 'loop', row: 1, col: 32, width: 3, label: 'Loop:', get: c => sndOf(c)!.loopOn, set: (c, v) => { sndOf(c)!.loopOn = v; } }),
    viewField(),
  ]),
  draw(c, f) {
    header(c, f); const s = sndOf(c); if (!s) return;
    drawWave(c, f, [s.loopTo, s.loopTo + s.loopLength], [s.st, s.end]);
    text(f, 5, 0, `End=${fmtFrames(s.loopTo + s.loopLength)}  EDIT = fit loop to sample length`, ATTR_DIM);
  },
  softKeys: pageKeys('LOOP'),
};

export const zonePage: ScreenDef = {
  id: 'TRIM/ZONE',
  fields: c => (noSound(c) ? [sndField()] : [
    sndField(), playXField(),
    frameField({ id: 'zst', row: 1, col: 3, label: 'St:', get: s => zone(s).st, set: setZoneSt, window: 'TRIM/ZONE_ST_FINE' }),
    frameField({ id: 'zend', row: 1, col: 17, label: 'End:', get: s => zone(s).end, set: setZoneEnd, window: 'TRIM/ZONE_END_FINE' }),
    { id: 'zone', row: 1, col: 31, width: 5, label: 'Zone:', get: c => { const s = sndOf(c)!; ensureZones(s); return `${st.zone + 1}/${s.zones.length}`.padStart(5, ' '); },
      wheel: (c, d) => { const s = sndOf(c)!; ensureZones(s); st.zone = clamp(st.zone + d, 0, s.zones.length - 1); },
      enter: (c, digits) => { const s = sndOf(c)!; ensureZones(s); const n = parseInt(digits, 10); if (n >= 1) st.zone = clamp(n - 1, 0, s.zones.length - 1); },
      window: c => c.fw.openWindow('TRIM/NUM_ZONES', { n: sndOf(c)!.zones.length }) },
    viewField(),
  ]),
  draw(c, f) {
    header(c, f); const s = sndOf(c); if (!s) return;
    ensureZones(s);
    const z = s.zones[st.zone];
    drawWave(c, f, [z.st, z.end], s.zones.map(x => x.st).concat([s.end]));
    text(f, 5, 0, `Zone ${st.zone + 1}: ${secs(z.end - z.st, s.rate)}   WINDOW on Zone: no. of zones`, ATTR_DIM);
  },
  softKeys: pageKeys('ZONE'),
};

export const paramsPage: ScreenDef = {
  id: 'TRIM/PARAMS',
  fields: c => (noSound(c) ? [sndField()] : [
    sndField(), playXField(),
    intField({ id: 'level', row: 1, col: 6, width: 3, label: 'Level:', min: 0, max: 100, get: c => sndOf(c)!.level, set: (c, v) => { sndOf(c)!.level = v; } }),
    intField({ id: 'tune', row: 3, col: 5, width: 4, label: 'Tune:', min: -120, max: 120, get: c => sndOf(c)!.tune, set: (c, v) => { sndOf(c)!.tune = v; }, fmt: v => `${v > 0 ? '+' : ''}${v}`.padStart(4, ' ') }),
    intField({ id: 'beat', row: 1, col: 27, width: 2, label: 'Beat:', min: 1, max: 64, get: c => sndOf(c)!.beat, set: (c, v) => { sndOf(c)!.beat = v; } }),
  ]),
  draw(c, f) {
    header(c, f); const s = sndOf(c); if (!s) return;
    text(f, 1, 12, 'BEAT', ATTR_DIM); text(f, 2, 12, 'LOOP', ATTR_DIM); text(f, 3, 12, 'FUNCTION', ATTR_DIM);
    const t = regionTempo(s.rate, s.st, s.end, s.beat);
    text(f, 2, 22, `Sample tempo=${t.toFixed(1)}`);
    text(f, 3, 22, `New tempo=${(t * Math.pow(2, s.tune / 120)).toFixed(1)}`);
    text(f, 5, 0, `${s.channels === 2 ? 'STEREO' : 'MONO'} ${s.rate}Hz ${secs(s.length, s.rate)} ${Math.round(s.length * s.channels * 2 / 1024)}K`, ATTR_DIM);
  },
  softKeys: pageKeys('PARAMS'),
};

// ---------- fine windows ----------
type FineTarget = 'st' | 'end' | 'to' | 'loopEnd' | 'zst' | 'zend';
const FINE: Record<FineTarget, { id: string; title: string; label: string; lenLabel: string; get: (s: Sound) => number; set: (s: Sound, v: number) => void; sel: (s: Sound) => [number, number] }> = {
  st: { id: 'TRIM/ST_FINE', title: 'Start fine', label: 'Start:', lenLabel: 'Smpl Lngth:', get: s => s.st, set: setSt, sel: s => [s.st, s.end] },
  end: { id: 'TRIM/END_FINE', title: 'End fine', label: 'End:', lenLabel: 'Smpl Lngth:', get: s => s.end, set: setEnd, sel: s => [s.st, s.end] },
  to: { id: 'TRIM/TO_FINE', title: 'Loop To fine', label: 'To:', lenLabel: 'Loop Lngth:', get: s => s.loopTo, set: setTo, sel: s => [s.loopTo, s.loopTo + s.loopLength] },
  loopEnd: { id: 'TRIM/LOOPEND_FINE', title: 'Loop End fine', label: 'End:', lenLabel: 'Loop Lngth:', get: s => s.loopTo + s.loopLength, set: setLoopEnd, sel: s => [s.loopTo, s.loopTo + s.loopLength] },
  zst: { id: 'TRIM/ZONE_ST_FINE', title: 'Zone start fine', label: 'Start:', lenLabel: 'Zone Lngth:', get: s => zone(s).st, set: setZoneSt, sel: s => [zone(s).st, zone(s).end] },
  zend: { id: 'TRIM/ZONE_END_FINE', title: 'Zone end fine', label: 'End:', lenLabel: 'Zone Lngth:', get: s => zone(s).end, set: setZoneEnd, sel: s => [zone(s).st, zone(s).end] },
};
function fineWindow(t: FineTarget): ScreenDef {
  const d = FINE[t];
  const fixed = (c: Ctx) => str(c, 'lngth', 'VARI') === 'FIX';
  return {
    id: d.id, title: d.title,
    fields: () => [
      { id: 'value', row: 2, col: 8, width: 8, label: d.label, coarse: 100,
        get: c => { const s = sndOf(c); return s ? fmtFrames(d.get(s)) : ''; },
        wheel: (c, dl) => { const s = sndOf(c); if (!s) return; const [a, b] = d.sel(s); const len = b - a; d.set(s, d.get(s) + dl); if (fixed(c)) { if (t === 'st') s.end = clamp(s.st + len, s.st + 1, s.length); if (t === 'to') s.loopLength = clamp(len, 1, s.length - s.loopTo); } clampSound(s); },
        enter: (c, digits) => { const s = sndOf(c); const v = parseInt(digits, 10); if (s && !isNaN(v)) { d.set(s, v); clampSound(s); } } },
      enumField({ id: 'lngth', row: 3, col: 12, width: 4, label: d.lenLabel, values: ['VARI', 'FIX'] as const, get: c => str(c, 'lngth', 'VARI') as 'VARI' | 'FIX', set: (c, v) => setP(c, 'lngth', v) }),
      playXField(),
    ],
    draw(c, f) {
      const s = sndOf(c); if (!s) return;
      const [a, b] = d.sel(s);
      text(f, 2, 20, `Lngth=${fmtFrames(b - a)}`, ATTR_DIM);
      const zoom = num(c, 'zoom', Math.max(256, Math.floor(s.length / 8)));
      const centre = d.get(s);
      drawWave(c, f, [a, b], [centre], 4, 3, { from: centre - zoom / 2, to: centre + zoom / 2 });
      text(f, 3, 30, `zoom ${zoom}f`, ATTR_DIM);
    },
    softKeys: () => [null,
      { label: 'ZOOM-', kind: 'action', press: c => { const s = sndOf(c); if (s) setP(c, 'zoom', Math.min(s.length, num(c, 'zoom', s.length / 8) * 2)); } },
      { label: 'ZOOM+', kind: 'action', press: c => { const s = sndOf(c); if (s) setP(c, 'zoom', Math.max(256, Math.floor(num(c, 'zoom', s.length / 8) / 2))); } },
      { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null,
      { label: 'PLAY X', kind: 'action', press: c => audition(c, t.startsWith('z') ? 'ZONE' : t === 'to' || t === 'loopEnd' ? 'LOOP' : 'TRIM'), release: c => c.fw.sound.stopAll() }],
  };
}

export const fitLengthWindow: ScreenDef = {
  id: 'TRIM/FIT_LENGTH', title: 'Fit to length',
  fields: () => [], draw(c, f) { text(f, 3, 2, 'Pressing DO IT will set the loop length'); text(f, 4, 2, 'to the sample length (St to End).'); void c; },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() }, { label: 'DO IT', kind: 'action', press: c => { const s = sndOf(c); if (s) { s.loopTo = s.st; s.loopLength = s.end - s.st; s.loopOn = true; } c.fw.closeWindow(); } }, null],
};

export const numZonesWindow: ScreenDef = {
  id: 'TRIM/NUM_ZONES', title: 'Number of Zones',
  fields: () => [intField({ id: 'n', row: 3, col: 18, width: 2, label: 'Number of zones:', min: 1, max: MAX_ZONES, get: c => num(c, 'n', 1), set: (c, v) => setP(c, 'n', v) })],
  draw(c, f) { text(f, 5, 2, 'Pressing DO IT will reset St/End values.', ATTR_DIM); void c; },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, { label: 'DO IT', kind: 'action', press: c => { const s = sndOf(c); if (s) { s.zones = equalZones(s.st, s.end, num(c, 'n', 1)); st.zone = 0; } c.fw.closeWindow(); } }, null],
};

// ---------- EDIT window ----------
const OPS_TRIM = ['DISCARD', 'LOOP FROM ST TO END', 'SECTION > NEW SOUND', 'INSERT SOUND > SECTION START', 'DELETE SECTION', 'SILENCE SECTION', 'REVERSE SECTION', 'NORMALIZE', 'TIME STRETCH'] as const;
const OPS_ZONE = [...OPS_TRIM, 'SLICE SOUND'] as const;
type Op = typeof OPS_ZONE[number];
const opOf = (c: Ctx) => str(c, 'op', 'DISCARD') as Op;

function applyEdit(c: Ctx) {
  const s = sndOf(c); if (!s) return;
  const op = opOf(c);
  const name = (suffix: string, k = 'name') => str(c, k, `${s.name.slice(0, 16 - suffix.length)}${suffix}`).slice(0, 16);
  switch (op) {
    case 'DISCARD': replacePcm(s, discard(s.pcm, s.st, s.end)); s.st = 0; s.end = s.length; s.loopTo = 0; s.loopLength = s.length; s.zones = equalZones(0, s.length, 1); break;
    case 'LOOP FROM ST TO END': s.loopTo = s.st; s.loopLength = s.end - s.st; s.loopOn = true; break;
    case 'SECTION > NEW SOUND': { const n = newSound(name('-S'), slice(s.pcm, s.st, s.end), s.rate); c.m.sounds.push(n); c.s.sound = c.m.sounds.length - 1; break; }
    case 'INSERT SOUND > SECTION START': { const other = c.m.sounds[num(c, 'ins', 0)]; if (!other) return; replacePcm(s, insert(s.pcm, other.pcm, s.st)); s.end = clamp(s.end + other.length, 1, s.length); break; }
    case 'DELETE SECTION': { const from = s.st; replacePcm(s, deleteSection(s.pcm, s.st, s.end)); s.end = clamp(from, 1, s.length); s.st = Math.max(0, s.end - 1); s.zones = equalZones(s.st, s.end, 1); break; }
    case 'SILENCE SECTION': replacePcm(s, silence(s.pcm, s.st, s.end)); break;
    case 'REVERSE SECTION': replacePcm(s, reverse(s.pcm, s.st, s.end)); break;
    case 'NORMALIZE': replacePcm(s, normalize(s.pcm)); break;
    case 'TIME STRETCH': { const ratio = num(c, 'ratio', 10000) / 100; const n = newSound(name('-T'), timeStretch(slice(s.pcm, s.st, s.end), s.rate, ratio, num(c, 'preset', 11), str(c, 'quality', 'A') as 'A' | 'B' | 'C', num(c, 'adjust', 0)), s.rate); c.m.sounds.push(n); c.s.sound = c.m.sounds.length - 1; break; }
    case 'SLICE SOUND': {
      ensureZones(s);
      const slices = sliceZones(s, num(c, 'margin', 0));
      c.m.sounds.push(...slices);
      if (bool(c, 'pgm', true)) {
        let i = c.m.programs.findIndex(p => !p.used);
        if (i < 0) i = c.m.drums[c.s.drum].pgm;
        const pg = newProgram(i, s.name.slice(0, 16)); pg.used = true;
        slices.forEach((sl, k) => { if (k < pg.padToNote.length) pg.notes[pg.padToNote[k] - NOTE_MIN].snd = sl.id; });
        c.m.programs[i] = pg; c.m.drums[c.s.drum].pgm = i; c.s.program = i;
      }
      break;
    }
  }
  clampSound(s);
}

export const editWindow: ScreenDef = {
  id: 'TRIM/EDIT', title: 'Edit',
  fields: c => {
    const ops = bool(c, 'fromZone', false) ? OPS_ZONE : OPS_TRIM;
    const op = opOf(c);
    const s = sndOf(c);
    const f: Field[] = [enumField({ id: 'op', row: 2, col: 5, width: 28, label: 'Edit:', values: ops, get: x => opOf(x), set: (x, v) => setP(x, 'op', v) })];
    if (op === 'SECTION > NEW SOUND' || op === 'TIME STRETCH') f.push(nameField({ id: 'name', row: 3, col: 10, label: 'New name:', get: x => str(x, 'name', `${sndOf(x)!.name.slice(0, 14)}${op === 'TIME STRETCH' ? '-T' : '-S'}`), set: (x, v) => setP(x, 'name', v) }));
    if (op === 'INSERT SOUND > SECTION START') f.push({ id: 'ins', row: 3, col: 11, width: 20, label: 'Insert snd:', get: x => x.m.sounds[num(x, 'ins', 0)]?.name ?? '(none)', wheel: (x, d) => setP(x, 'ins', clamp(num(x, 'ins', 0) + d, 0, x.m.sounds.length - 1)) });
    if (op === 'TIME STRETCH') {
      f.push({ id: 'ratio', row: 4, col: 6, width: 6, label: 'Ratio:', get: x => (num(x, 'ratio', 10000) / 100).toFixed(2).padStart(6, ' '), wheel: (x, d) => setP(x, 'ratio', clamp(num(x, 'ratio', 10000) + d * 10, 5000, 20000)), enter: (x, digits) => setP(x, 'ratio', clamp(parseInt(digits, 10), 5000, 20000)) });
      f.push({ id: 'preset', row: 5, col: 7, width: 15, label: 'Preset:', get: x => `${num(x, 'preset', 11) + 1} ${STRETCH_PRESETS[num(x, 'preset', 11)]}`, wheel: (x, d) => setP(x, 'preset', clamp(num(x, 'preset', 11) + d, 0, STRETCH_PRESETS.length - 1)) });
      f.push(enumField({ id: 'quality', row: 5, col: 26, width: 1, values: ['A', 'B', 'C'] as const, get: x => str(x, 'quality', 'A') as 'A' | 'B' | 'C', set: (x, v) => setP(x, 'quality', v) }));
      f.push(intField({ id: 'adjust', row: 4, col: 22, width: 3, label: 'Adjust:', min: -50, max: 50, get: x => num(x, 'adjust', 0), set: (x, v) => setP(x, 'adjust', v), fmt: v => `${v > 0 ? '+' : ''}${v}`.padStart(3, ' ') }));
    }
    if (op === 'SLICE SOUND') {
      f.push(intField({ id: 'margin', row: 3, col: 12, width: 5, label: 'End margin:', min: 0, max: 9999, get: x => num(x, 'margin', 0), set: (x, v) => setP(x, 'margin', v) }));
      f.push(boolField({ id: 'pgm', row: 4, col: 20, width: 3, label: 'Create new program:', style: 'YES', get: x => bool(x, 'pgm', true), set: (x, v) => setP(x, 'pgm', v) }));
    }
    void s;
    return f;
  },
  draw(c, f) {
    const s = sndOf(c); if (!s) return;
    const op = opOf(c);
    if (op === 'SLICE SOUND') text(f, 5, 2, `${s.zones.length} zones -> ${s.zones.length} new sounds on pads A01..`, ATTR_DIM);
    else if (op === 'DISCARD' || op.endsWith('SECTION') || op === 'SECTION > NEW SOUND') text(f, 5, 2, `Section St..End = ${fmtFrames(s.end - s.st).trim()} frames (${secs(s.end - s.st, s.rate)})`, ATTR_DIM);
  },
  softKeys: c => [null,
    opOf(c) === 'TIME STRETCH' ? { label: 'BPM', kind: 'action', press: x => x.fw.openWindow('TRIM/BPM_MATCH', { newTempo: Math.round(regionTempo(sndOf(x)!.rate, sndOf(x)!.st, sndOf(x)!.end, sndOf(x)!.beat) * 10) }) } : null,
    null,
    { label: 'CANCEL', kind: 'action', press: x => x.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: x => { applyEdit(x); x.fw.closeWindow(); } },
    null],
};

export const bpmMatchWindow: ScreenDef = {
  id: 'TRIM/BPM_MATCH', title: 'BPM Match',
  fields: () => [
    intField({ id: 'beat', row: 2, col: 6, width: 2, label: 'Beat:', min: 1, max: 64, get: c => sndOf(c)!.beat, set: (c, v) => { sndOf(c)!.beat = v; } }),
    { id: 'new', row: 4, col: 11, width: 5, label: 'New tempo:', get: c => (num(c, 'newTempo', 1200) / 10).toFixed(1).padStart(5, ' '),
      wheel: (c, d) => setP(c, 'newTempo', clamp(num(c, 'newTempo', 1200) + d, 300, 3000)), enter: (c, digits) => setP(c, 'newTempo', clamp(parseInt(digits, 10) * (digits.length > 3 ? 1 : 10), 300, 3000)) },
  ],
  draw(c, f) { const s = sndOf(c)!; text(f, 3, 0, `Source tempo:${regionTempo(s.rate, s.st, s.end, s.beat).toFixed(1).padStart(5, ' ')}`); },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => {
      const s = sndOf(c)!; const src = regionTempo(s.rate, s.st, s.end, s.beat); const nt = num(c, 'newTempo', 1200) / 10;
      const parent = c.s.windows[c.s.windows.length - 2]; if (parent) { parent.params = { ...parent.params, ratio: clamp(Math.round((src / nt) * 10000), 5000, 20000) }; }
      c.fw.closeWindow();
    } }, null],
};

// ---------- Sound window, convert, copy ----------
function deleteSound(c: Ctx, id: string) {
  c.m.sounds = c.m.sounds.filter(s => s.id !== id);
  for (const pg of c.m.programs) for (const n of pg.notes) if (n.snd === id) n.snd = null;
  c.s.sound = clamp(c.s.sound, 0, Math.max(0, c.m.sounds.length - 1));
}
export const soundWindow: ScreenDef = {
  id: 'TRIM/SOUND', title: 'Sound',
  fields: () => [nameField({ id: 'name', row: 2, col: 13, label: 'Sound name:', get: c => sndOf(c)?.name ?? '', set: (c, n) => { const s = sndOf(c); if (s) s.name = n; } })],
  draw(c, f) {
    const s = sndOf(c); if (!s) { text(f, 3, 2, 'No sound selected.', ATTR_DIM); return; }
    text(f, 3, 2, '<Sound spec.>', ATTR_DIM);
    text(f, 4, 2, `Type:${s.channels === 2 ? 'STEREO' : 'MONO'}   Rate:${s.rate}Hz   Size:${Math.round(s.length * s.channels * 2 / 1024)}K`);
  },
  softKeys: () => [null,
    { label: 'DELETE', kind: 'action', press: c => { const s = sndOf(c); if (!s) return; c.fw.confirm({ title: 'Delete Sound', lines: [`Snd:${s.name}`, '', 'Pressing DO IT will erase this sound !!'], doIt: () => { deleteSound(c, s.id); c.fw.closeAllWindows(); },
      extra: { index: 2, label: 'ALL', run: () => c.fw.confirm({ title: 'Delete ALL Sound', lines: ['', 'Pressing DO IT will erase ALL sounds!!'], doIt: () => { for (const x of [...c.m.sounds]) deleteSound(c, x.id); c.fw.closeAllWindows(); } }) } }); } },
    { label: 'CONVRT', kind: 'action', press: c => { if (sndOf(c)) c.fw.openWindow('TRIM/CONVERT', { kind: sndOf(c)!.channels === 2 ? 'STEREO TO MONO' : 'MONO TO STEREO', fs: sndOf(c)!.rate }); } },
    { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'COPY', kind: 'action', press: c => { if (sndOf(c)) c.fw.openWindow('TRIM/COPY_SOUND'); } },
    null],
};

const CONVERTS = ['STEREO TO MONO', 'MONO TO STEREO', 'RE-SAMPLE'] as const;
export const convertWindow: ScreenDef = {
  id: 'TRIM/CONVERT', title: 'Convert Sound',
  fields: c => {
    const kind = str(c, 'kind', 'RE-SAMPLE') as typeof CONVERTS[number];
    const s = sndOf(c)!;
    const f: Field[] = [enumField({ id: 'kind', row: 2, col: 8, width: 14, label: 'Convert:', values: CONVERTS, get: x => str(x, 'kind', 'RE-SAMPLE') as typeof CONVERTS[number], set: (x, v) => setP(x, 'kind', v) })];
    if (kind === 'STEREO TO MONO') {
      f.push(nameField({ id: 'ln', row: 3, col: 12, label: 'New L name:', get: x => str(x, 'ln', `${s.name.slice(0, 14)}-L`), set: (x, v) => setP(x, 'ln', v) }));
      f.push(nameField({ id: 'rn', row: 4, col: 12, label: 'New R name:', get: x => str(x, 'rn', `${s.name.slice(0, 14)}-R`), set: (x, v) => setP(x, 'rn', v) }));
    } else if (kind === 'MONO TO STEREO') {
      f.push({ id: 'r', row: 3, col: 10, width: 20, label: 'R source:', get: x => x.m.sounds[num(x, 'r', x.s.sound)]?.name ?? '', wheel: (x, d) => setP(x, 'r', clamp(num(x, 'r', x.s.sound) + d, 0, x.m.sounds.length - 1)) });
      f.push(nameField({ id: 'sn', row: 4, col: 13, label: 'New ST name:', get: x => str(x, 'sn', `${s.name.slice(0, 14)}-S`), set: (x, v) => setP(x, 'sn', v) }));
    } else {
      f.push(intField({ id: 'fs', row: 3, col: 8, width: 5, label: 'New Fs:', min: 4000, max: 48000, step: 100, get: x => num(x, 'fs', s.rate), set: (x, v) => setP(x, 'fs', v) }));
      f.push(enumField({ id: 'q', row: 3, col: 24, width: 4, label: 'Quality:', values: ['LOW', 'MED', 'HIGH'] as const, get: x => str(x, 'q', 'HIGH') as ResampleQuality, set: (x, v) => setP(x, 'q', v) }));
      f.push(enumField({ id: 'bit', row: 4, col: 9, width: 2, label: 'New Bit:', values: ['16', '12', '8'] as const, get: x => String(num(x, 'bit', 16)) as '16' | '12' | '8', set: (x, v) => setP(x, 'bit', parseInt(v, 10)) }));
      f.push(nameField({ id: 'name', row: 5, col: 10, label: 'New name:', get: x => str(x, 'name', `${s.name.slice(0, 14)}-R`), set: (x, v) => setP(x, 'name', v) }));
    }
    return f;
  },
  draw(c, f) { const s = sndOf(c)!; if (str(c, 'kind', 'RE-SAMPLE') === 'STEREO TO MONO' && s.channels !== 2) text(f, 5, 2, 'Source is mono.', ATTR_DIM); if (str(c, 'kind', 'RE-SAMPLE') === 'MONO TO STEREO') text(f, 5, 2, `L source:${s.name}`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => {
      const s = sndOf(c)!; const kind = str(c, 'kind', 'RE-SAMPLE');
      if (kind === 'STEREO TO MONO') { if (s.channels !== 2) return; c.m.sounds.push(newSound(str(c, 'ln', `${s.name.slice(0, 14)}-L`), [s.pcm[0].slice()], s.rate), newSound(str(c, 'rn', `${s.name.slice(0, 14)}-R`), [s.pcm[1].slice()], s.rate)); }
      else if (kind === 'MONO TO STEREO') { const r = c.m.sounds[num(c, 'r', c.s.sound)] ?? s; const L = toMono(s.pcm); const R = new Float32Array(L.length); R.set(toMono(r.pcm).subarray(0, L.length)); c.m.sounds.push(newSound(str(c, 'sn', `${s.name.slice(0, 14)}-S`), [L, R], s.rate)); }
      else { const fs = num(c, 'fs', s.rate); let pcm = resample(s.pcm, s.rate, fs, str(c, 'q', 'HIGH') as ResampleQuality); const bits = num(c, 'bit', 16); if (bits < 16) pcm = bitReduce(pcm, bits); c.m.sounds.push(newSound(str(c, 'name', `${s.name.slice(0, 14)}-R`), pcm, fs)); }
      c.s.sound = c.m.sounds.length - 1;
      c.fw.closeAllWindows();
    } }, null],
};

export const copySoundWindow: ScreenDef = {
  id: 'TRIM/COPY_SOUND', title: 'Copy Sound',
  fields: () => [nameField({ id: 'name', row: 4, col: 10, label: 'New Name:', get: c => str(c, 'name', `${sndOf(c)!.name.slice(0, 14)}-C`), set: (c, v) => setP(c, 'name', v) })],
  draw(c, f) { text(f, 2, 2, `Snd:${sndOf(c)!.name}`); },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => { const s = sndOf(c)!; const n = newSound(str(c, 'name', `${s.name.slice(0, 14)}-C`), s.pcm.map(ch => ch.slice()), s.rate); Object.assign(n, { st: s.st, end: s.end, loopTo: s.loopTo, loopLength: s.loopLength, loopOn: s.loopOn, zones: s.zones.map(z => ({ ...z })), level: s.level, tune: s.tune, beat: s.beat }); c.m.sounds.push(n); c.s.sound = c.m.sounds.length - 1; c.fw.closeAllWindows(); } }, null],
};

export const trimEntry: ScreenDef = { id: 'TRIM', fields: () => [], draw() {}, softKeys: pageKeys('TRIM'), onEnter(c) { c.fw.setPage('TRIM'); } };

export const trimScreens: ScreenDef[] = [
  trimEntry, trimPage, loopPage, zonePage, paramsPage,
  fineWindow('st'), fineWindow('end'), fineWindow('to'), fineWindow('loopEnd'), fineWindow('zst'), fineWindow('zend'),
  fitLengthWindow, numZonesWindow, editWindow, bpmMatchWindow, soundWindow, convertWindow, copySoundWindow,
];
