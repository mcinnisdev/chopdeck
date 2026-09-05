// STEP EDIT: the event list at the current position, with copy/delete/insert/paste, multi-select edit,
// step recording from the pads, and the options window.
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE, setAttr } from '@/lcd/frame';
import { SeqEvent, NoteEvent, TIMING_TICKS, TIMING_VALUES, NOTE_MIN, NOTE_MAX, PPQ, EventKind, MixerParam, TRACK_TYPES } from '@/model/types';
import { tickToBBT, formatBBT, barStartTick, sequenceLengthTicks } from '@/model/time';
import { notePad, midiNoteName, padName } from '@/model/format';
import { insertEvent, sortEvents, applyValueEdit, ValueEdit } from '@/seq/events';
import { enumField, intField, boolField, clamp } from './util';
import { seqOf, trackOf } from './main';

type View = 'ALL EVENTS' | 'NOTES' | 'PITCH BEND' | 'CTRL' | 'PROG CHANGE' | 'CH PRESSURE' | 'POLY PRESS' | 'EXCLUSIVE' | 'MIXER';
const VIEWS: readonly View[] = ['ALL EVENTS', 'NOTES', 'PITCH BEND', 'CTRL', 'PROG CHANGE', 'CH PRESSURE', 'POLY PRESS', 'EXCLUSIVE', 'MIXER'];
const VIEW_KIND: Record<View, EventKind | null> = { 'ALL EVENTS': null, NOTES: 'note', 'PITCH BEND': 'bend', CTRL: 'cc', 'PROG CHANGE': 'pgm', 'CH PRESSURE': 'chpress', 'POLY PRESS': 'polypress', EXCLUSIVE: 'sysex', MIXER: 'mixer' };
const ROWS = 5;

export const stepState = {
  view: 'ALL EVENTS' as View,
  cc: -1,                       // CTRL view filter, -1 = ALL
  clipboard: [] as SeqEvent[],  // ticks relative to the copy position
  anchor: null as number | null, // multi-select anchor (event index)
  autoStep: true,
  durMode: 'AS PLAYED' as 'AS PLAYED' | 'TC VALUE',
  durPct: 50,
  held: new Map<number, { ev: NoteEvent; at: number }>(),
};

const padMap = (c: Ctx) => { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const isDrum = (c: Ctx) => trackOf(c).type !== 'MIDI';

/** Events shown: those at Now, filtered by View. */
export function listed(c: Ctx): SeqEvent[] {
  const kind = VIEW_KIND[stepState.view];
  return trackOf(c).events.filter(e => e.tick === c.s.now && (!kind || e.kind === kind) && (stepState.view !== 'CTRL' || stepState.cc < 0 || (e.kind === 'cc' && e.cc === stepState.cc)));
}

function eventFields(c: Ctx, e: SeqEvent, row: number, i: number): Field[] {
  const p = `e${i}.`;
  const base = (id: string, col: number, width: number, label: string, get: () => string, wheel: (d: number) => void, enter?: (v: number) => void): Field =>
    ({ id: p + id, row, col, width, label, get: () => get(), wheel: (_c, d) => wheel(d), enter: enter ? (_c, digits) => { const v = parseInt(digits, 10); if (!isNaN(v)) enter(v); } : undefined });
  switch (e.kind) {
    case 'note': {
      const noteStr = () => (isDrum(c) ? notePad(e.note, padMap(c)) : `${String(e.note).padStart(3, ' ')}(${midiNoteName(e.note)})`);
      const f = [
        base('n', 4, 7, 'N:', noteStr, d => { e.note = clamp(e.note + d, isDrum(c) ? NOTE_MIN : 0, isDrum(c) ? NOTE_MAX : 127); }, v => { e.note = clamp(v, 0, 127); }),
        base('d', 24, 4, 'D:', () => String(e.dur).padStart(4, ' '), d => { e.dur = clamp(e.dur + d, 1, 9999); }, v => { e.dur = clamp(v, 1, 9999); }),
        base('v', 31, 3, 'V:', () => String(e.vel).padStart(3, ' '), d => { e.vel = clamp(e.vel + d, 1, 127); }, v => { e.vel = clamp(v, 1, 127); }),
      ];
      if (isDrum(c)) f.splice(1, 0, base('t', 16, 4, 'Tun:', () => `${e.nv > 0 ? '+' : ''}${e.nv}`.padStart(4, ' '), d => { e.nv = clamp(e.nv + d, -120, 120); }, v => { e.nv = clamp(v, -120, 120); }));
      return f;
    }
    case 'bend': return [base('b', 7, 5, 'Bend:', () => String(e.value).padStart(5, ' '), d => { e.value = clamp(e.value + d, -8192, 8191); }, v => { e.value = clamp(v, -8192, 8191); })];
    case 'cc': return [base('c', 15, 3, 'Ctrl change:', () => String(e.cc).padStart(3, ' '), d => { e.cc = clamp(e.cc + d, 0, 127); }, v => { e.cc = clamp(v, 0, 127); }), base('cv', 23, 3, 'Val:', () => String(e.value).padStart(3, ' '), d => { e.value = clamp(e.value + d, 0, 127); }, v => { e.value = clamp(v, 0, 127); })];
    case 'pgm': return [base('p', 13, 3, 'Prog change:', () => String(e.value).padStart(3, ' '), d => { e.value = clamp(e.value + d, 1, 128); }, v => { e.value = clamp(v, 1, 128); })];
    case 'chpress': return [base('cp', 13, 3, 'Ch pressure:', () => String(e.value).padStart(3, ' '), d => { e.value = clamp(e.value + d, 0, 127); }, v => { e.value = clamp(v, 0, 127); })];
    case 'polypress': return [base('pn', 10, 3, 'Poly pr N:', () => String(e.note).padStart(3, ' '), d => { e.note = clamp(e.note + d, 0, 127); }), base('pv', 17, 3, 'V:', () => String(e.value).padStart(3, ' '), d => { e.value = clamp(e.value + d, 0, 127); })];
    case 'sysex': return [{ id: p + 'x', row, col: 10, width: 36, label: 'Exclusive:', get: () => e.bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').slice(0, 36) }];
    case 'mixer': return [
      base('mp', 6, 6, 'Mixer:', () => e.param.padEnd(6, ' '), d => { const list: MixerParam[] = ['LEVEL', 'PAN', 'FXSEND', 'INDIV']; e.param = list[(list.indexOf(e.param) + d + list.length * 4) % list.length]; }),
      base('mpad', 17, 3, 'Pad:', () => padName(e.pad), d => { e.pad = clamp(e.pad + d, 0, 63); }),
      base('mv', 25, 3, 'Val:', () => String(e.value).padStart(3, ' '), d => { e.value = clamp(e.value + d, 0, 100); }, v => { e.value = clamp(v, 0, 100); }),
    ];
  }
}

function fields(c: Ctx): Field[] {
  const f: Field[] = [
    enumField({ id: 'view', row: 0, col: 5, width: 10, label: 'View:', values: VIEWS, get: () => stepState.view, set: (_x, v) => { stepState.view = v; stepState.anchor = null; } }),
    { id: 'now', row: 0, col: 39, width: 9, label: 'Now:', get: x => formatBBT(tickToBBT(seqOf(x).tsigs, x.s.now)),
      wheel: (x, d) => x.fw.transport.locate(Math.max(0, x.s.now + d * (x.m.timing === 'OFF' ? 1 : TIMING_TICKS[x.m.timing]))),
      enter: (x, digits) => { const bar = parseInt(digits, 10); if (bar >= 1) x.fw.transport.locate(barStartTick(seqOf(x).tsigs, bar - 1)); } },
  ];
  if (stepState.view === 'CTRL') f.push(intField({ id: 'ccf', row: 0, col: 19, width: 3, label: ':', min: -1, max: 127, get: () => stepState.cc, set: (_x, v) => { stepState.cc = v; }, fmt: v => (v < 0 ? 'ALL' : String(v).padStart(3, ' ')) }));
  listed(c).slice(0, ROWS).forEach((e, i) => f.push(...eventFields(c, e, 1 + i, i)));
  return f;
}

/** Index of the event row under the cursor (or -1 on the header). */
function cursorEvent(c: Ctx): number {
  const all = fields(c).filter(f => !f.skip && !f.hidden?.(c)).sort((a, b) => a.row - b.row || a.col - b.col);
  const id = all[clamp(c.s.cursor.STEP ?? 0, 0, all.length - 1)]?.id ?? '';
  const m = /^e(\d+)\./.exec(id);
  return m ? parseInt(m[1], 10) : -1;
}
function cursorFieldKey(c: Ctx): string {
  const all = fields(c).filter(f => !f.skip && !f.hidden?.(c)).sort((a, b) => a.row - b.row || a.col - b.col);
  return all[clamp(c.s.cursor.STEP ?? 0, 0, all.length - 1)]?.id.split('.')[1] ?? '';
}
function selectedEvents(c: Ctx): SeqEvent[] {
  const list = listed(c); const i = cursorEvent(c);
  if (i < 0) return [];
  if (stepState.anchor == null) return [list[i]].filter(Boolean);
  const [a, b] = [Math.min(stepState.anchor, i), Math.max(stepState.anchor, i)];
  return list.slice(a, b + 1);
}
const multi = (c: Ctx) => stepState.anchor != null && cursorEvent(c) >= 0;

function defaultEvent(kind: EventKind, tick: number, c: Ctx): SeqEvent {
  switch (kind) {
    case 'note': return { kind, tick, note: isDrum(c) ? padMap(c)[c.s.lastPad ?? 0] : 60, vel: 100, dur: Math.max(1, (c.m.timing === 'OFF' ? 24 : TIMING_TICKS[c.m.timing]) - 2), nv: 0 };
    case 'bend': return { kind, tick, value: 0 };
    case 'cc': return { kind, tick, cc: 1, value: 64 };
    case 'pgm': return { kind, tick, value: 1 };
    case 'chpress': return { kind, tick, value: 0 };
    case 'polypress': return { kind, tick, note: 60, value: 0 };
    case 'sysex': return { kind, tick, bytes: [0xf0, 0xf7] };
    case 'mixer': return { kind, tick, param: 'LEVEL', pad: c.s.lastPad ?? 0, value: 100 };
  }
}

export const stepScreen: ScreenDef = {
  id: 'STEP',
  fields,
  draw(c, f) {
    const list = listed(c);
    if (!list.length) {
      const next = trackOf(c).events.find(e => e.tick > c.s.now);
      text(f, 3, 2, `No events at this position.${next ? `  Next: ${formatBBT(tickToBBT(seqOf(c).tsigs, next.tick))}` : ''}`, ATTR_DIM);
    }
    list.slice(0, ROWS).forEach((e, i) => {
      const row = 1 + i;
      const sel = multi(c) && selectedEvents(c).includes(e);
      text(f, row, 0, sel ? '*' : '>', sel ? ATTR_INVERSE : 0);
      if (e.kind === 'note') { const bars = Math.round(e.vel / 16); text(f, row, 35, '▮'.repeat(bars).padEnd(8, ' '), ATTR_DIM); }
    });
    if (list.length > ROWS) text(f, 6, 40, `+${list.length - ROWS} more`, ATTR_DIM);
    if (stepState.clipboard.length) text(f, 6, 0, `clip:${stepState.clipboard.length}`, ATTR_DIM);
    const tc = c.m.timing === 'OFF' ? 'OFF' : `${c.m.timing}(${TIMING_TICKS[c.m.timing]})`;
    text(f, 6, 10, `T.C.:${tc}`, ATTR_DIM);
    void setAttr;
  },
  softKeys: c => [
    { label: 'TC', kind: 'action', press: x => x.fw.openWindow('STEP/TC'), release: x => { if (x.s.windows[x.s.windows.length - 1]?.id === 'STEP/TC') x.fw.closeWindow(); } },
    { label: 'COPY', kind: 'action', press: x => { const sel = selectedEvents(x); if (sel.length) { stepState.clipboard = sel.map(e => ({ ...structuredClone(e), tick: e.tick - x.s.now })); stepState.anchor = null; } } },
    { label: 'DELETE', kind: 'action', press: x => { const sel = new Set(selectedEvents(x)); if (!sel.size) return; x.fw.snapshotForUndo(); const tr = trackOf(x); tr.events = tr.events.filter(e => !sel.has(e)); stepState.anchor = null; } },
    multi(c) ? { label: 'EDIT', kind: 'action', press: x => x.fw.openWindow('STEP/EDIT_MULTIPLE', { key: cursorFieldKey(x) }) }
            : { label: 'INSERT', kind: 'action', press: x => x.fw.openWindow('STEP/INSERT') },
    multi(c) ? null : { label: 'PASTE', kind: 'action', press: x => { if (stepState.clipboard.length) x.fw.openWindow('STEP/PASTE'); } },
    { label: 'PLAY', kind: 'action', press: x => { const sel = selectedEvents(x); const drum = Math.max(0, TRACK_TYPES.indexOf(trackOf(x).type) - 1); for (const e of sel) if (e.kind === 'note') x.fw.sound.noteOn(drum, e.note, e.vel); }, release: x => x.fw.sound.stopAll() },
  ],
  onKey(c, k, down) {
    if (!down) return false;
    if (c.s.shift && (k === 'UP' || k === 'DOWN')) {
      const i = cursorEvent(c); const n = listed(c).length;
      if (i < 0 || !n) return true;
      if (stepState.anchor == null) stepState.anchor = i;
      // move the cursor to the same field on the neighbouring row
      const all = fields(c).filter(f => !f.skip && !f.hidden?.(c)).sort((a, b) => a.row - b.row || a.col - b.col);
      const cur = all[clamp(c.s.cursor.STEP ?? 0, 0, all.length - 1)];
      const target = clamp(i + (k === 'DOWN' ? 1 : -1), 0, Math.min(n, ROWS) - 1);
      const idx = all.findIndex(f => f.row === 1 + target && f.col === cur.col);
      if (idx >= 0) c.s.cursor.STEP = idx; else { const first = all.findIndex(f => f.row === 1 + target); if (first >= 0) c.s.cursor.STEP = first; }
      return true;
    }
    if (k === 'UP' || k === 'DOWN' || k === 'LEFT' || k === 'RIGHT') stepState.anchor = null;
    if (k === 'WINDOW' && !c.s.windows.length) { c.fw.openWindow('STEP/OPTIONS'); return true; }
    return false;
  },
  onPad(c, pad, vel, down) {
    // step recording: a pad hit writes a note at Now; release sets the duration
    if (c.s.playing) return false;
    const tr = trackOf(c);
    if (down) {
      c.fw.snapshotForUndo();
      const ev: NoteEvent = { kind: 'note', tick: c.s.now, note: padMap(c)[pad], vel, dur: 1, nv: 0 };
      insertEvent(tr.events, ev); tr.used = true;
      stepState.held.set(pad, { ev, at: c.fw.sound.now() });
      return false; // let it sound
    }
    const h = stepState.held.get(pad); if (!h) return false;
    stepState.held.delete(pad);
    const grid = c.m.timing === 'OFF' ? PPQ / 4 : TIMING_TICKS[c.m.timing];
    if (stepState.durMode === 'TC VALUE') h.ev.dur = Math.max(1, Math.round(grid * stepState.durPct / 100));
    else { const tempo = seqOf(c).tempoSource === 'MAS' ? c.s.masterTempo : seqOf(c).tempo; const sec = Math.max(0, c.fw.sound.now() - h.at); h.ev.dur = Math.max(1, Math.round(sec * (tempo * PPQ) / 60) || Math.round(grid / 2)); }
    if (stepState.autoStep && !stepState.held.size) c.fw.transport.locate(c.s.now + grid);
    return false;
  },
  onLeave() { stepState.anchor = null; stepState.held.clear(); },
};

export const tcWindow: ScreenDef = {
  id: 'STEP/TC', title: 'Timing Correct', windowRows: 3,
  fields: () => [enumField({ id: 'tc', row: 2, col: 8, width: 12, label: 'Value:', values: TIMING_VALUES, get: c => c.m.timing, set: (c, v) => { c.m.timing = v; } })],
  draw(c, f) { if (c.m.timing !== 'OFF') text(f, 2, 20, `(${TIMING_TICKS[c.m.timing]})`, ATTR_DIM); },
  softKeys: () => [null, null, null, null, null, null],
};

export const insertWindow: ScreenDef = {
  id: 'STEP/INSERT', title: 'Insert Event',
  fields: () => [enumField({ id: 'type', row: 3, col: 6, width: 14, label: 'Type:', values: ['NOTE', 'PITCH BEND', 'CONTROL CHANGE', 'PROGRAM CHANGE', 'CH PRESSURE', 'POLY PRESSURE', 'EXCLUSIVE', 'MIXER'] as const,
    get: c => (c.s.windows[c.s.windows.length - 1]!.params ??= {}).type as never ?? 'NOTE', set: (c, v) => { (c.s.windows[c.s.windows.length - 1]!.params ??= {}).type = v; } })],
  draw(c, f) { text(f, 5, 2, `Inserted at ${formatBBT(tickToBBT(seqOf(c).tsigs, c.s.now))}`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => {
      const t = ((c.s.windows[c.s.windows.length - 1]!.params ??= {}).type as string) ?? 'NOTE';
      const kind = ({ NOTE: 'note', 'PITCH BEND': 'bend', 'CONTROL CHANGE': 'cc', 'PROGRAM CHANGE': 'pgm', 'CH PRESSURE': 'chpress', 'POLY PRESSURE': 'polypress', EXCLUSIVE: 'sysex', MIXER: 'mixer' } as Record<string, EventKind>)[t];
      c.fw.snapshotForUndo();
      const tr = trackOf(c); insertEvent(tr.events, defaultEvent(kind, c.s.now, c)); tr.used = true;
      c.fw.closeWindow();
    } }, null],
};

export const pasteWindow: ScreenDef = {
  id: 'STEP/PASTE', title: 'Paste Event',
  fields: () => [],
  draw(c, f) { text(f, 3, 2, `Pressing DO IT will paste ${stepState.clipboard.length} event(s)`); text(f, 4, 2, `from the clipboard at ${formatBBT(tickToBBT(seqOf(c).tsigs, c.s.now))}.`); },
  softKeys: () => {
    const paste = (c: Ctx, replace: boolean) => {
      c.fw.snapshotForUndo();
      const tr = trackOf(c);
      const incoming = stepState.clipboard.map(e => ({ ...structuredClone(e), tick: e.tick + c.s.now }));
      if (replace) { const kinds = new Set(incoming.map(e => e.kind)); const ticks = new Set(incoming.map(e => e.tick)); tr.events = tr.events.filter(e => !(kinds.has(e.kind) && ticks.has(e.tick))); }
      for (const e of incoming) insertEvent(tr.events, e);
      sortEvents(tr.events); tr.used = true;
      c.fw.closeWindow();
    };
    return [null, null, null, { label: 'RPLACE', kind: 'action', press: c => paste(c, true) }, { label: 'MERGE', kind: 'action', press: c => paste(c, false) }, null];
  },
};

const EDIT_TYPES = ['ADD VALUE', 'SUB VALUE', 'MULT VAL%', 'SET TO VAL'] as const;
export const editMultipleWindow: ScreenDef = {
  id: 'STEP/EDIT_MULTIPLE', title: 'Edit Multiple',
  fields: c => {
    const p = (c.s.windows[c.s.windows.length - 1]!.params ??= {});
    if (p.key === 'n') return [{ id: 'note', row: 3, col: 16, width: 12, label: 'Change note to:', get: x => { const n = (p.note as number) ?? 60; return isDrum(x) ? notePad(n, padMap(x)) : `${n}(${midiNoteName(n)})`; }, wheel: (_x, d) => { p.note = clamp(((p.note as number) ?? 60) + d, 0, 127); }, pad: (x, pad) => { p.note = padMap(x)[pad]; } }];
    return [
      enumField({ id: 'type', row: 3, col: 10, width: 10, label: 'Edit type:', values: EDIT_TYPES, get: () => ((p.type as typeof EDIT_TYPES[number]) ?? 'ADD VALUE'), set: (_x, v) => { p.type = v; } }),
      intField({ id: 'value', row: 4, col: 6, width: 4, label: 'Value:', min: -8192, max: 9999, get: () => (p.value as number) ?? 10, set: (_x, v) => { p.value = v; } }),
    ];
  },
  draw(c, f) { const sel = selectedEvents(c); text(f, 5, 2, `${sel.length} events selected`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'DO IT', kind: 'action', press: c => {
      const p = (c.s.windows[c.s.windows.length - 1]!.params ??= {});
      const key = p.key as string; const sel = selectedEvents(c);
      c.fw.snapshotForUndo();
      const edit: ValueEdit = { type: (p.type as ValueEdit['type']) ?? 'ADD VALUE', value: (p.value as number) ?? 10 };
      for (const e of sel) {
        if (key === 'n' && e.kind === 'note') e.note = (p.note as number) ?? e.note;
        else if (key === 'v' && e.kind === 'note') e.vel = applyValueEdit(e.vel, edit, 1, 127);
        else if (key === 'd' && e.kind === 'note') e.dur = applyValueEdit(e.dur, edit, 1, 9999);
        else if (key === 't' && e.kind === 'note') e.nv = applyValueEdit(e.nv, edit, -120, 120);
        else if ('value' in e && typeof e.value === 'number') e.value = applyValueEdit(e.value, edit, e.kind === 'bend' ? -8192 : 0, e.kind === 'bend' ? 8191 : e.kind === 'pgm' ? 128 : 127);
      }
      stepState.anchor = null;
      c.fw.closeWindow();
    } }, null],
};

export const optionsWindow: ScreenDef = {
  id: 'STEP/OPTIONS', title: 'Step Edit Options',
  fields: () => [
    boolField({ id: 'auto', row: 2, col: 21, width: 3, label: 'Auto step increment:', style: 'YES', get: () => stepState.autoStep, set: (_c, v) => { stepState.autoStep = v; } }),
    enumField({ id: 'dur', row: 3, col: 28, width: 9, label: 'Duration of recorded notes:', values: ['AS PLAYED', 'TC VALUE'] as const, get: () => stepState.durMode, set: (_c, v) => { stepState.durMode = v; } }),
    intField({ id: 'pct', row: 4, col: 30, width: 3, label: '%', min: 1, max: 100, get: () => stepState.durPct, set: (_c, v) => { stepState.durPct = v; }, hidden: () => stepState.durMode !== 'TC VALUE' }),
  ],
  draw(c, f) { text(f, 6, 2, `Sequence end: ${formatBBT(tickToBBT(seqOf(c).tsigs, sequenceLengthTicks(seqOf(c))))}`, ATTR_DIM); },
  softKeys: () => [null, null, null, { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() }, null, null],
};

export const stepScreens: ScreenDef[] = [stepScreen, tcWindow, insertWindow, pasteWindow, editMultipleWindow, optionsWindow];
export type { SoftKeyDef };
