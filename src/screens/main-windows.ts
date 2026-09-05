// The remaining MAIN-screen windows: Time Display, Tempo Change, Timing Correct, Change Tsig, Count/Metronome,
// Edit Velocity, Erase, Locate, Insert/Delete Bars, MIDI Input/Output, and the EDIT > USER defaults page.
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { TIMING_VALUES, TIMING_TICKS, TRACK_TYPES, NUM_TRACKS, NOTE_MIN, NOTE_MAX, TEMPO_MIN, TEMPO_MAX, EventKind } from '@/model/types';
import { tickToBBT, formatBBT, barStartTick, ticksPerBar, tsigAtBar, sequenceLengthTicks } from '@/model/time';
import { pad2, notePad, midiOutName, tempoStr, tsigStr, midiNoteName } from '@/model/format';
import { timingCorrect, editVelocity, eraseEvents, insertBars, deleteBars } from '@/seq/events';
import { changeTsig } from '@/seq/tsig';
import { intField, enumField, boolField, nameField, clamp } from './util';
import { seqOf, trackOf } from './main';

const wp = (c: Ctx): Record<string, unknown> => { const w = c.s.windows[c.s.windows.length - 1]; if (!w) return {}; if (!w.params) w.params = {}; return w.params; };
const num = (c: Ctx, k: string, d: number) => (typeof wp(c)[k] === 'number' ? (wp(c)[k] as number) : d);
const str = (c: Ctx, k: string, d: string) => (typeof wp(c)[k] === 'string' ? (wp(c)[k] as string) : d);
const setP = (c: Ctx, k: string, v: unknown) => { wp(c)[k] = v; };
const seqEnd = (c: Ctx) => Math.max(sequenceLengthTicks(seqOf(c)), ticksPerBar(tsigAtBar(seqOf(c).tsigs, 0)));
const padMap = (c: Ctx) => { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const close = (): SoftKeyDef => ({ label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() });
const cancel = (): SoftKeyDef => ({ label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() });

/** bar.beat.tick field: wheel steps by the Timing value, SHIFT+LEFT/RIGHT by a bar, numeric entry = bar number. */
export function bbtField(o: { id: string; row: number; col: number; label?: string; get: (c: Ctx) => number; set: (c: Ctx, tick: number) => void; min?: (c: Ctx) => number; max?: (c: Ctx) => number }): Field {
  const lim = (c: Ctx, v: number) => clamp(v, o.min?.(c) ?? 0, o.max?.(c) ?? 999999);
  return {
    id: o.id, row: o.row, col: o.col, width: 9, label: o.label,
    get: c => formatBBT(tickToBBT(seqOf(c).tsigs, o.get(c))),
    wheel: (c, d) => { const step = c.m.timing === 'OFF' ? 1 : TIMING_TICKS[c.m.timing]; o.set(c, lim(c, o.get(c) + d * step)); },
    coarse: 384,
    enter: (c, digits) => { const bar = parseInt(digits, 10); if (bar >= 1) o.set(c, lim(c, barStartTick(seqOf(c).tsigs, bar - 1))); },
  };
}

/** Time range fields over window params `from`/`to` (default: whole sequence). */
function rangeFields(row: number): Field[] {
  return [
    bbtField({ id: 'from', row, col: 5, label: 'Time:', get: c => num(c, 'from', 0), set: (c, v) => setP(c, 'from', Math.min(v, num(c, 'to', seqEnd(c)))) }),
    { id: 'dash', row, col: 14, width: 1, get: () => '-', skip: true },
    bbtField({ id: 'to', row, col: 15, label: '', get: c => num(c, 'to', seqEnd(c)), set: (c, v) => setP(c, 'to', Math.max(v, num(c, 'from', 0))) }),
  ];
}
const range = (c: Ctx) => ({ from: num(c, 'from', 0), to: num(c, 'to', seqEnd(c)) });

/** Notes filter: DRUM tracks pick one pad (or ALL); MIDI tracks a note range. Params: note (0=ALL), lo, hi. */
function notesFields(row: number, col = 6): Field[] {
  const isDrum = (c: Ctx) => trackOf(c).type !== 'MIDI';
  return [
    { id: 'note', row, col, width: 16, label: 'Notes:', hidden: c => !isDrum(c),
      get: c => { const n = num(c, 'note', 0); return n ? `${notePad(n, padMap(c))}` : 'ALL (Hit pad)'; },
      wheel: (c, d) => { const n = num(c, 'note', 0); const v = n === 0 ? (d > 0 ? NOTE_MIN : 0) : n + d; setP(c, 'note', v < NOTE_MIN ? 0 : Math.min(NOTE_MAX, v)); },
      pad: (c, pad) => setP(c, 'note', padMap(c)[pad]) },
    { id: 'lo', row, col, width: 7, label: 'Notes:', hidden: c => isDrum(c), get: c => `${String(num(c, 'lo', 0)).padStart(3, ' ')}(${midiNoteName(num(c, 'lo', 0))})`,
      wheel: (c, d) => setP(c, 'lo', clamp(num(c, 'lo', 0) + d, 0, num(c, 'hi', 127))) },
    { id: 'hi', row, col: col + 8, width: 8, label: '-', hidden: c => isDrum(c), get: c => `${String(num(c, 'hi', 127)).padStart(3, ' ')}(${midiNoteName(num(c, 'hi', 127))})`,
      wheel: (c, d) => setP(c, 'hi', clamp(num(c, 'hi', 127) + d, num(c, 'lo', 0), 127)) },
  ];
}
const notesFilter = (c: Ctx): { lo: number; hi: number } | null => {
  if (trackOf(c).type !== 'MIDI') { const n = num(c, 'note', 0); return n ? { lo: n, hi: n } : null; }
  return { lo: num(c, 'lo', 0), hi: num(c, 'hi', 127) };
};

// ---------- Time Display ----------
export const timeDisplayWindow: ScreenDef = {
  id: 'MAIN/TIME_DISPLAY', title: 'Time Display',
  fields: () => [
    enumField({ id: 'style', row: 2, col: 17, width: 15, label: 'Display style:', values: ['BAR,BEAT,CLOCK', 'HOUR,MINUTE,SEC'] as const, get: c => c.m.timeDisplay.style, set: (c, v) => { c.m.timeDisplay.style = v; } }),
    { id: 'start', row: 3, col: 17, width: 9, label: 'Start time:', get: c => { const s = c.m.timeDisplay.startTime; return `${pad2(Math.floor(s / 3600))}h${pad2(Math.floor(s / 60) % 60)}m${pad2(s % 60)}s`; },
      wheel: (c, d) => { c.m.timeDisplay.startTime = clamp(c.m.timeDisplay.startTime + d, 0, 24 * 3600 - 1); }, coarse: 60 },
    enumField({ id: 'fps', row: 4, col: 17, width: 6, label: 'Frame rate:', values: ['24', '25', '29.97D', '30'] as const,
      get: c => ({ 24: '24', 25: '25', 29.97: '29.97D', 30: '30' } as const)[c.m.timeDisplay.frameRate], set: (c, v) => { c.m.timeDisplay.frameRate = v === '24' ? 24 : v === '25' ? 25 : v === '30' ? 30 : 29.97; } }),
  ],
  draw() {},
  softKeys: () => [null, null, null, close(), null, null],
};

// ---------- Tempo Change ----------
const tempoOf = (c: Ctx) => (seqOf(c).tempoSource === 'MAS' ? c.s.masterTempo : seqOf(c).tempo);
const setTempo = (c: Ctx, v: number) => { const t = clamp(Math.round(v * 10) / 10, TEMPO_MIN, TEMPO_MAX); if (seqOf(c).tempoSource === 'MAS') c.s.masterTempo = t; else seqOf(c).tempo = t; };
const VISIBLE = 3;
const tcSelected = (c: Ctx) => { const i = c.s.cursor['MAIN/TEMPO_CHANGE'] ?? 0; return i < 2 ? num(c, 'off', 0) : num(c, 'off', 0) + Math.floor((i - 2) / 2); };

export const tempoChangeWindow: ScreenDef = {
  id: 'MAIN/TEMPO_CHANGE', title: 'Tempo Change',
  fields: c => {
    const q = seqOf(c); const off = num(c, 'off', 0);
    const fields: Field[] = [
      boolField({ id: 'on', row: 2, col: 13, width: 3, label: 'Tempo change:', get: x => seqOf(x).tempoChangeOn, set: (x, v) => { seqOf(x).tempoChangeOn = v; } }),
      { id: 'init', row: 2, col: 30, width: 5, label: 'Initial ♩:', get: x => tempoStr(tempoOf(x)), wheel: (x, d) => setTempo(x, tempoOf(x) + d / 10), enter: (x, digits) => setTempo(x, parseInt(digits, 10) / (digits.length > 3 ? 10 : 1)) },
    ];
    for (let r = 0; r < VISIBLE; r++) {
      const i = off + r; if (i >= q.tempoChanges.length) break;
      const row = 3 + r;
      fields.push(bbtField({ id: `t${i}`, row, col: 4, label: '', get: x => seqOf(x).tempoChanges[i]?.tick ?? 0,
        set: (x, v) => { if (i === 0) return; const list = seqOf(x).tempoChanges; const lo = (list[i - 1]?.tick ?? 0) + 1; const hi = (list[i + 1]?.tick ?? Infinity) - 1; list[i].tick = clamp(v, lo, hi); } }));
      fields.push({ id: `r${i}`, row, col: 17, width: 5, label: '%:', get: x => (seqOf(x).tempoChanges[i].ratio * 100).toFixed(1).padStart(5, ' '),
        wheel: (x, d) => { const e = seqOf(x).tempoChanges[i]; e.ratio = clamp(Math.round((e.ratio * 100 + d / 10) * 10) / 1000, 0.1, 5); },
        enter: (x, digits) => { const e = seqOf(x).tempoChanges[i]; e.ratio = clamp(parseInt(digits, 10) / 1000, 0.1, 5); } });
    }
    return fields;
  },
  draw(c, f) {
    const q = seqOf(c); const off = num(c, 'off', 0);
    for (let r = 0; r < VISIBLE; r++) { const i = off + r; const e = q.tempoChanges[i]; if (!e) break; text(f, 3 + r, 1, `${i + 1}`.padStart(2, ' ')); text(f, 3 + r, 24, `♩=${tempoStr(Math.round(tempoOf(c) * e.ratio * 10) / 10)}`); }
    if (q.tempoChanges.length > off + VISIBLE) text(f, 6, 44, 'more', ATTR_DIM);
  },
  softKeys: () => [null,
    { label: 'DELETE', kind: 'action', press: c => { const i = tcSelected(c); if (i > 0) { seqOf(c).tempoChanges.splice(i, 1); setP(c, 'off', Math.max(0, Math.min(num(c, 'off', 0), seqOf(c).tempoChanges.length - VISIBLE))); } } },
    { label: 'NOW', kind: 'action', press: c => { const i = tcSelected(c); if (i > 0) { const list = seqOf(c).tempoChanges; list[i].tick = clamp(c.s.now, (list[i - 1]?.tick ?? 0) + 1, (list[i + 1]?.tick ?? Infinity) - 1); } } },
    close(),
    { label: 'INSERT', kind: 'action', press: c => { const list = seqOf(c).tempoChanges; const i = tcSelected(c); const next = list[i + 1]?.tick ?? seqEnd(c); const mid = c.s.now > list[i].tick && c.s.now < next ? c.s.now : Math.floor((list[i].tick + next) / 2); if (mid <= list[i].tick) return; list.splice(i + 1, 0, { tick: mid, ratio: list[i].ratio }); seqOf(c).tempoChangeOn = true; } },
    null],
  onKey(c, k, down) {
    if (!down) return false;
    const i = c.s.cursor['MAIN/TEMPO_CHANGE'] ?? 0; const off = num(c, 'off', 0); const n = seqOf(c).tempoChanges.length;
    if (k === 'DOWN' && i >= 2 + (VISIBLE - 1) * 2 && off + VISIBLE < n) { setP(c, 'off', off + 1); return true; }
    if (k === 'UP' && i >= 2 && i < 4 && off > 0) { setP(c, 'off', off - 1); return true; }
    return false;
  },
};

// ---------- Timing Correct ----------
export const timingCorrectWindow: ScreenDef = {
  id: 'MAIN/TIMING_CORRECT', title: 'Timing Correct',
  fields: () => [
    enumField({ id: 'value', row: 2, col: 11, width: 7, label: 'Note value:', values: TIMING_VALUES, get: c => c.m.timing, set: (c, v) => { c.m.timing = v; } }),
    intField({ id: 'swing', row: 2, col: 30, width: 2, label: 'Swing%:', min: 50, max: 75, get: c => c.m.swing, set: (c, v) => { c.m.swing = v; }, hidden: c => c.m.timing !== '1/8' && c.m.timing !== '1/16' }),
    enumField({ id: 'shift', row: 3, col: 13, width: 7, label: 'Shift timing:', values: ['EARLIER', 'LATER'] as const, get: c => str(c, 'shift', 'EARLIER') as 'EARLIER' | 'LATER', set: (c, v) => setP(c, 'shift', v) }),
    intField({ id: 'amount', row: 3, col: 30, width: 3, label: 'amount:', min: 0, max: 48, get: c => Math.min(num(c, 'amount', 0), Math.floor(TIMING_TICKS[c.m.timing] / 2)), set: (c, v) => setP(c, 'amount', Math.min(v, Math.floor(TIMING_TICKS[c.m.timing] / 2))) }),
    ...rangeFields(4),
    ...notesFields(5),
  ],
  draw() {},
  softKeys: () => [null, null, null, close(),
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); const { from, to } = range(c); const amt = num(c, 'amount', 0) * (str(c, 'shift', 'EARLIER') === 'EARLIER' ? -1 : 1); timingCorrect(trackOf(c), { value: c.m.timing, swing: c.m.swing, shift: amt, from, to, notes: notesFilter(c) }); c.fw.closeWindow(); } },
    null],
};

// ---------- Change Tsig ----------
export const changeTsigWindow: ScreenDef = {
  id: 'MAIN/CHANGE_TSIG', title: 'Change Tsig',
  fields: () => [
    intField({ id: 'first', row: 2, col: 4, width: 3, label: 'Bar:', min: 1, max: 999, get: c => num(c, 'first', 1), set: (c, v) => { setP(c, 'first', v); if (num(c, 'last', 1) < v) setP(c, 'last', v); } }),
    intField({ id: 'last', row: 2, col: 10, width: 3, label: '-', min: 1, max: 999, get: c => Math.max(num(c, 'last', Math.max(1, seqOf(c).bars)), num(c, 'first', 1)), set: (c, v) => setP(c, 'last', Math.max(v, num(c, 'first', 1))) }),
    intField({ id: 'num', row: 3, col: 10, width: 2, label: 'New Tsig:', min: 1, max: 32, get: c => num(c, 'num', tsigAtBar(seqOf(c).tsigs, 0).num), set: (c, v) => setP(c, 'num', v) }),
    enumField({ id: 'den', row: 3, col: 13, width: 2, label: '/', values: [' 2', ' 4', ' 8', '16'] as const, get: c => String(num(c, 'den', tsigAtBar(seqOf(c).tsigs, 0).den)).padStart(2, ' ') as ' 2' | ' 4' | ' 8' | '16', set: (c, v) => setP(c, 'den', parseInt(v, 10)) }),
  ],
  draw(c, f) { text(f, 5, 2, 'Pressing DO IT will truncate or add space in each bar.'.slice(0, 46), ATTR_DIM); void c; },
  softKeys: () => [null, null, null, cancel(),
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); const q = seqOf(c); const t0 = tsigAtBar(q.tsigs, 0); changeTsig(q, num(c, 'first', 1), Math.max(num(c, 'last', Math.max(1, q.bars)), num(c, 'first', 1)), num(c, 'num', t0.num), num(c, 'den', t0.den)); c.fw.closeWindow(); } },
    null],
};

// ---------- Count / Metronome ----------
export const countWindow: ScreenDef = {
  id: 'MAIN/COUNT', title: 'Count/Metronome',
  fields: () => [
    enumField({ id: 'countIn', row: 2, col: 10, width: 8, label: 'Count IN:', values: ['OFF', 'REC+PLAY', 'REC ONLY'] as const, get: c => c.m.count.countIn, set: (c, v) => { c.m.count.countIn = v; } }),
    boolField({ id: 'inPlay', row: 3, col: 9, width: 3, label: 'In play:', style: 'YES', get: c => c.m.count.inPlay, set: (c, v) => { c.m.count.inPlay = v; } }),
    boolField({ id: 'inRec', row: 3, col: 23, width: 3, label: 'In rec:', style: 'YES', get: c => c.m.count.inRec, set: (c, v) => { c.m.count.inRec = v; } }),
    enumField({ id: 'rate', row: 4, col: 6, width: 7, label: 'Rate:', values: ['1/4', '1/8', '1/8(3)', '1/16', '1/16(3)', '1/32', '1/32(3)'] as const, get: c => c.m.count.rate, set: (c, v) => { c.m.count.rate = v; } }),
    boolField({ id: 'wait', row: 5, col: 14, width: 3, label: 'Wait for key:', get: c => c.m.count.waitForKey, set: (c, v) => { c.m.count.waitForKey = v; } }),
  ],
  draw() {},
  softKeys: () => [null, null, null, close(), { label: 'SOUND', kind: 'action', press: c => c.fw.openWindow('MAIN/METRONOME_SOUND') }, null],
};

export const metronomeSoundWindow: ScreenDef = {
  id: 'MAIN/METRONOME_SOUND', title: 'Metronome Sound',
  fields: () => {
    const isClick = (c: Ctx) => c.m.count.sound === 'CLICK';
    return [
      enumField({ id: 'sound', row: 2, col: 7, width: 5, label: 'Sound:', values: ['CLICK', 'DRUM1', 'DRUM2', 'DRUM3', 'DRUM4'] as const, get: c => c.m.count.sound, set: (c, v) => { c.m.count.sound = v; } }),
      intField({ id: 'vol', row: 3, col: 8, width: 3, label: 'Volume:', min: 0, max: 100, get: c => c.m.count.clickVolume, set: (c, v) => { c.m.count.clickVolume = v; }, hidden: c => !isClick(c) }),
      enumField({ id: 'out', row: 4, col: 8, width: 6, label: 'Output:', values: ['STEREO'] as const, get: () => 'STEREO', set: () => {}, hidden: c => !isClick(c) }),
      { id: 'accent', row: 3, col: 8, width: 6, label: 'Accent:', hidden: c => isClick(c), get: c => notePad(c.m.count.accentNote, padMap(c)), wheel: (c, d) => { c.m.count.accentNote = clamp(c.m.count.accentNote + d, NOTE_MIN, NOTE_MAX); }, pad: (c, pad) => { c.m.count.accentNote = padMap(c)[pad]; } },
      intField({ id: 'accentVel', row: 3, col: 25, width: 3, label: 'Velocity:', min: 1, max: 127, get: c => c.m.count.accentVel, set: (c, v) => { c.m.count.accentVel = v; }, hidden: c => isClick(c) }),
      { id: 'normal', row: 4, col: 8, width: 6, label: 'Normal:', hidden: c => isClick(c), get: c => notePad(c.m.count.normalNote, padMap(c)), wheel: (c, d) => { c.m.count.normalNote = clamp(c.m.count.normalNote + d, NOTE_MIN, NOTE_MAX); }, pad: (c, pad) => { c.m.count.normalNote = padMap(c)[pad]; } },
      intField({ id: 'normalVel', row: 4, col: 25, width: 3, label: 'Velocity:', min: 1, max: 127, get: c => c.m.count.normalVel, set: (c, v) => { c.m.count.normalVel = v; }, hidden: c => isClick(c) }),
    ];
  },
  draw() {},
  softKeys: () => [null, null, null, close(), null, null],
};

// ---------- Edit Velocity ----------
const EDIT_TYPES = ['ADD VALUE', 'SUB VALUE', 'MULT VAL%', 'SET TO VAL'] as const;
export const editVelocityWindow: ScreenDef = {
  id: 'MAIN/EDIT_VELOCITY', title: 'Edit Velocity',
  fields: () => [
    enumField({ id: 'type', row: 2, col: 10, width: 10, label: 'Edit type:', values: EDIT_TYPES, get: c => str(c, 'type', 'ADD VALUE') as typeof EDIT_TYPES[number], set: (c, v) => setP(c, 'type', v) }),
    intField({ id: 'value', row: 2, col: 30, width: 3, label: 'Value:', min: 0, max: 200, get: c => num(c, 'value', 10), set: (c, v) => setP(c, 'value', v) }),
    ...rangeFields(3),
    ...notesFields(4),
  ],
  draw() {},
  softKeys: () => [null, null, null, close(),
    { label: 'DO IT', kind: 'action', press: c => { c.fw.snapshotForUndo(); const { from, to } = range(c); editVelocity(trackOf(c), { type: str(c, 'type', 'ADD VALUE') as typeof EDIT_TYPES[number], value: num(c, 'value', 10) }, from, to, notesFilter(c)); c.fw.closeWindow(); } },
    null],
};

// ---------- Erase ----------
const ERASE_TYPES = ['NOTES', 'PITCH BEND', 'CONTROL CHANGE', 'PROGRAM CHANGE', 'CH PRESSURE', 'POLY PRESSURE', 'EXCLUSIVE', 'MIXER'] as const;
const ERASE_KIND: Record<typeof ERASE_TYPES[number], EventKind> = { NOTES: 'note', 'PITCH BEND': 'bend', 'CONTROL CHANGE': 'cc', 'PROGRAM CHANGE': 'pgm', 'CH PRESSURE': 'chpress', 'POLY PRESSURE': 'polypress', EXCLUSIVE: 'sysex', MIXER: 'mixer' };
export const eraseWindow: ScreenDef = {
  id: 'MAIN/ERASE', title: 'Erase',
  fields: () => [
    { id: 'track', row: 2, col: 6, width: 20, label: 'Track:', get: c => { const t = num(c, 'track', c.s.track + 1); return t === 0 ? ' 0-(ALL)' : `${String(t).padStart(2, ' ')}-${seqOf(c).tracks[t - 1].name}`; },
      wheel: (c, d) => setP(c, 'track', clamp(num(c, 'track', c.s.track + 1) + d, 0, NUM_TRACKS)), enter: (c, digits) => setP(c, 'track', clamp(parseInt(digits, 10) || 0, 0, NUM_TRACKS)) },
    ...rangeFields(3),
    enumField({ id: 'mode', row: 4, col: 6, width: 10, label: 'Erase:', values: ['ALL EVENTS', 'ALL EXCEPT', 'ONLY ERASE'] as const, get: c => str(c, 'mode', 'ALL EVENTS') as 'ALL EVENTS' | 'ALL EXCEPT' | 'ONLY ERASE', set: (c, v) => setP(c, 'mode', v) }),
    enumField({ id: 'kind', row: 4, col: 17, width: 14, values: ERASE_TYPES, get: c => str(c, 'kind', 'NOTES') as typeof ERASE_TYPES[number], set: (c, v) => setP(c, 'kind', v), hidden: c => str(c, 'mode', 'ALL EVENTS') === 'ALL EVENTS' }),
    ...notesFields(5).map(f => ({ ...f, hidden: (c: Ctx) => (f.hidden?.(c) ?? false) || !(str(c, 'mode', 'ALL EVENTS') === 'ALL EVENTS' || str(c, 'kind', 'NOTES') === 'NOTES') })),
  ],
  draw(c, f) { text(f, 2, 28, '(0=all)', ATTR_DIM); void c; },
  softKeys: () => [null, null, null, cancel(),
    { label: 'DO IT', kind: 'action', press: c => {
      c.fw.snapshotForUndo();
      const { from, to } = range(c); const t = num(c, 'track', c.s.track + 1);
      const mode = str(c, 'mode', 'ALL EVENTS'); const kind = ERASE_KIND[str(c, 'kind', 'NOTES') as typeof ERASE_TYPES[number]];
      const notes = mode === 'ALL EVENTS' || kind === 'note' ? notesFilter(c) : null;
      const tracks = t === 0 ? seqOf(c).tracks : [seqOf(c).tracks[t - 1]];
      for (const tr of tracks) eraseEvents(tr, { from, to, mode: mode === 'ALL EVENTS' ? 'ALL' : mode === 'ONLY ERASE' ? 'ONLY' : 'EXCEPT', kind: mode === 'ALL EVENTS' ? undefined : kind, notes });
      c.fw.closeWindow();
    } },
    null],
};

// ---------- Locate ----------
const MEM_POS: [number, number][] = [[5, 0], [5, 12], [5, 24], [4, 0], [4, 12], [4, 24], [3, 0], [3, 12], [3, 24]]; // memories 1..9 laid out like a keypad
// the kernel orders fields by row then column: goto first, then memories 7 8 9, 4 5 6, 1 2 3
const LOCATE_ORDER = [-1, 6, 7, 8, 3, 4, 5, 0, 1, 2];
const memUnderCursor = (c: Ctx) => LOCATE_ORDER[c.s.cursor.LOCATE ?? 0] ?? -1;
export const locateWindow: ScreenDef = {
  id: 'LOCATE', title: 'Locate',
  fields: () => [
    bbtField({ id: 'goto', row: 2, col: 6, label: 'Go to:', get: c => num(c, 'goto', c.s.now), set: (c, v) => setP(c, 'goto', v) }),
    ...MEM_POS.map(([row, col], i) => ({ id: `m${i}`, row, col: col + 2, width: 9, label: `${i + 1}:`, get: (c: Ctx) => formatBBT(tickToBBT(seqOf(c).tsigs, c.m.locateMemories[i])) } as Field)),
  ],
  draw() {},
  softKeys: () => [null,
    { label: 'STORE', kind: 'action', press: c => { const i = memUnderCursor(c); if (i >= 0) c.m.locateMemories[i] = c.s.now; } },
    null, close(),
    { label: 'GO TO', kind: 'action', press: c => { const i = memUnderCursor(c); c.fw.transport.locate(i >= 0 ? c.m.locateMemories[i] : num(c, 'goto', c.s.now)); c.fw.closeWindow(); } },
    null],
  onEnter(c) { setP(c, 'goto', c.s.now); },
};

// ---------- Insert / Delete bars ----------
export const barsInDelWindow: ScreenDef = {
  id: 'MAIN/BARS_INDEL', title: 'Insert/Delete Bars',
  fields: () => [
    intField({ id: 'after', row: 3, col: 11, width: 3, label: 'After bar:', min: 0, max: 999, get: c => num(c, 'after', seqOf(c).bars), set: (c, v) => setP(c, 'after', Math.min(v, seqOf(c).bars)) }),
    intField({ id: 'count', row: 4, col: 14, width: 3, label: 'Number of bar:', min: 1, max: 99, get: c => num(c, 'count', 1), set: (c, v) => setP(c, 'count', v) }),
    intField({ id: 'first', row: 3, col: 36, width: 3, label: 'First bar:', min: 1, max: 999, get: c => num(c, 'first', 1), set: (c, v) => { setP(c, 'first', v); if (num(c, 'last', 1) < v) setP(c, 'last', v); } }),
    intField({ id: 'last', row: 4, col: 36, width: 3, label: ' Last bar:', min: 1, max: 999, get: c => Math.max(num(c, 'last', Math.max(1, seqOf(c).bars)), num(c, 'first', 1)), set: (c, v) => setP(c, 'last', Math.max(v, num(c, 'first', 1))) }),
  ],
  draw(c, f) { text(f, 2, 2, 'INSERT', ATTR_DIM); text(f, 2, 27, 'DELETE', ATTR_DIM); void c; },
  softKeys: () => [null,
    { label: 'INSERT', kind: 'action', press: c => { c.fw.snapshotForUndo(); const q = seqOf(c); insertBars(q, num(c, 'after', q.bars), num(c, 'count', 1), ticksPerBar(tsigAtBar(q.tsigs, 0))); q.used = true; c.fw.closeAllWindows(); } },
    null, close(),
    { label: 'DELETE', kind: 'action', press: c => { c.fw.snapshotForUndo(); const q = seqOf(c); const first = num(c, 'first', 1); const last = Math.max(num(c, 'last', Math.max(1, q.bars)), first); if (first <= q.bars) deleteBars(q, first, Math.min(last, q.bars), ticksPerBar(tsigAtBar(q.tsigs, 0))); c.fw.closeAllWindows(); } },
    null],
};

// ---------- MIDI Input / Output ----------
export const midiInputWindow: ScreenDef = {
  id: 'MAIN/MIDI_INPUT', title: 'MIDI Input',
  fields: () => [
    intField({ id: 'rx', row: 2, col: 17, width: 3, label: 'Receive channel:', min: 0, max: 16, get: c => c.m.midi.receiveChannel, set: (c, v) => { c.m.midi.receiveChannel = v; }, fmt: v => (v === 0 ? 'ALL' : String(v).padStart(3, ' ')) }),
    boolField({ id: 'pc', row: 3, col: 17, width: 3, label: 'Prog change>seq:', get: c => c.m.midi.progChangeToSeq, set: (c, v) => { c.m.midi.progChangeToSeq = v; } }),
    boolField({ id: 'sus', row: 4, col: 27, width: 3, label: 'Sustain pedal to Duration:', get: c => c.m.midi.sustainToDuration, set: (c, v) => { c.m.midi.sustainToDuration = v; } }),
  ],
  draw(c, f) { text(f, 6, 2, 'MIDI ports arrive with the MIDI/SYNC OS update.', ATTR_DIM); void c; },
  softKeys: () => [null, null, null, close(), null, null],
};
export const midiOutputWindow: ScreenDef = {
  id: 'MAIN/MIDI_OUTPUT', title: 'MIDI Output',
  fields: () => [
    enumField({ id: 'thru', row: 2, col: 11, width: 8, label: 'Soft thru:', values: ['OFF', 'AS TRACK', 'OMNI-A', 'OMNI-B', 'OMNI-AB'] as const, get: c => c.m.midi.softThru, set: (c, v) => { c.m.midi.softThru = v; } }),
    nameField({ id: 'dev', row: 3, col: 18, label: 'Device name:', get: c => (trackOf(c).channel > 0 ? c.m.midi.deviceNames[trackOf(c).channel - 1] || `(${midiOutName(trackOf(c).channel)})` : '(track has no channel)'), set: (c, n) => { if (trackOf(c).channel > 0) c.m.midi.deviceNames[trackOf(c).channel - 1] = n; }, raw: c => (trackOf(c).channel > 0 ? c.m.midi.deviceNames[trackOf(c).channel - 1] : '') }),
  ],
  draw() {},
  softKeys: () => [null, null, null, close(), null, { label: 'PANIC', kind: 'action', press: c => c.fw.sound.stopAll() }],
};

// ---------- EDIT > USER (sequence defaults) ----------
export const userDefaultsPage: ScreenDef = {
  id: 'EDIT/USER',
  fields: () => [
    { id: 'tempo', row: 1, col: 2, width: 5, label: '♩:', get: c => tempoStr(c.m.defaults.tempo), wheel: (c, d) => { c.m.defaults.tempo = clamp(Math.round((c.m.defaults.tempo + d / 10) * 10) / 10, TEMPO_MIN, TEMPO_MAX); }, enter: (c, digits) => { c.m.defaults.tempo = clamp(parseInt(digits, 10) / (digits.length > 3 ? 10 : 1), TEMPO_MIN, TEMPO_MAX); } },
    enumField({ id: 'src', row: 1, col: 8, width: 3, label: '(', values: ['SEQ', 'MAS'] as const, get: c => c.m.defaults.tempoSource, set: (c, v) => { c.m.defaults.tempoSource = v; } }),
    { id: 'close', row: 1, col: 11, width: 1, get: () => ')', skip: true },
    intField({ id: 'num', row: 1, col: 21, width: 2, label: 'Tsig:', min: 1, max: 32, get: c => c.m.defaults.tsig.num, set: (c, v) => { c.m.defaults.tsig.num = v; } }),
    enumField({ id: 'den', row: 1, col: 24, width: 2, label: '/', values: [' 2', ' 4', ' 8', '16'] as const, get: c => String(c.m.defaults.tsig.den).padStart(2, ' ') as ' 2' | ' 4' | ' 8' | '16', set: (c, v) => { c.m.defaults.tsig.den = parseInt(v, 10); } }),
    boolField({ id: 'loop', row: 2, col: 5, width: 3, label: 'Loop:', get: c => c.m.defaults.loop, set: (c, v) => { c.m.defaults.loop = v; } }),
    intField({ id: 'bars', row: 2, col: 15, width: 3, label: 'Bars:', min: 0, max: 999, get: c => c.m.defaults.bars, set: (c, v) => { c.m.defaults.bars = v; } }),
    intField({ id: 'pgm', row: 2, col: 24, width: 3, label: 'Pgm:', min: 0, max: 128, get: c => c.m.defaults.pgm, set: (c, v) => { c.m.defaults.pgm = v; }, fmt: v => (v === 0 ? 'OFF' : String(v).padStart(3, ' ')) }),
    enumField({ id: 'type', row: 3, col: 6, width: 5, label: 'Type:', values: TRACK_TYPES, get: c => c.m.defaults.trackType, set: (c, v) => { c.m.defaults.trackType = v; } }),
    intField({ id: 'ch', row: 3, col: 12, width: 3, label: ':', min: 0, max: 32, get: c => c.m.defaults.channel, set: (c, v) => { c.m.defaults.channel = v; }, fmt: midiOutName }),
    intField({ id: 'velo', row: 3, col: 26, width: 3, label: 'Velo%:', min: 1, max: 200, get: c => c.m.defaults.veloPct, set: (c, v) => { c.m.defaults.veloPct = v; } }),
  ],
  draw(c, f) { text(f, 0, 0, 'Main screen user defaults'); text(f, 5, 0, 'New sequences start with these values.', ATTR_DIM); text(f, 6, 0, `Now: ${tsigStr(c.m.defaults.tsig.num, c.m.defaults.tsig.den)}  ${pad2(c.m.defaults.bars)} bars`, ATTR_DIM); },
  softKeys: () => [
    { label: 'EVENTS', kind: 'page', press: c => c.fw.setPage('EVENTS') },
    { label: 'BARS', kind: 'page', press: c => c.fw.setPage('BARS') },
    { label: 'TrMOVE', kind: 'page', press: c => c.fw.setPage('TRMOVE') },
    null, { label: 'USER', kind: 'current' }, null,
  ],
};

export const mainWindowScreens: ScreenDef[] = [
  timeDisplayWindow, tempoChangeWindow, timingCorrectWindow, changeTsigWindow, countWindow, metronomeSoundWindow,
  editVelocityWindow, eraseWindow, locateWindow, barsInDelWindow, midiInputWindow, midiOutputWindow, userDefaultsPage,
];
