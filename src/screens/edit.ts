// Sequence EDIT screen: EVENTS (copy / duration / velocity / transpose), BARS (copy by bar), TrMOVE.
// The USER page lives in main-windows.ts.
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_TRACKS } from '@/model/types';
import { tickToBBT, formatBBT, barStartTick, sequenceLengthTicks, ticksPerBar, tsigAtBar } from '@/model/time';
import { pad2 } from '@/model/format';
import { copyEvents, editDuration, editVelocity, transposeEvents, copyBars, ValueEdit } from '@/seq/events';
import { enumField, intField, clamp } from './util';
import { seqOf, trackOf } from './main';
import { bbtField } from './main-windows';

const OPS = ['COPY', 'DURATION', 'VELOCITY', 'TRANSPOSE'] as const;
const TYPES = ['ADD VALUE', 'SUB VALUE', 'MULT VAL%', 'SET TO VAL'] as const;
export const editState = {
  op: 'COPY' as typeof OPS[number],
  from: 0, to: -1,                    // -1 = sequence end
  toSeq: 0, toTrack: 0, mode: 'REPLACE' as 'REPLACE' | 'MERGE', start: 0, copies: 1,
  type: 'ADD VALUE' as typeof TYPES[number], value: 10, amount: 0,
  note: 0,                            // drum note filter, 0 = ALL
  barsFrom: 0, barsTo: 0, firstBar: 1, lastBar: 1, afterBar: 0, barCopies: 1,
  moveSel: null as number | null, movePos: 0,
};
const seqEnd = (c: Ctx) => Math.max(sequenceLengthTicks(seqOf(c)), ticksPerBar(tsigAtBar(seqOf(c).tsigs, 0)));
const toTick = (c: Ctx) => (editState.to < 0 ? seqEnd(c) : editState.to);
const padMap = (c: Ctx) => { const pg = c.m.programs[c.m.drums[c.s.drum].pgm]; return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote; };
const notesFilter = () => (editState.note ? { lo: editState.note, hi: editState.note } : null);
const seqLabel = (c: Ctx, i: number) => `${pad2(i + 1)}-${c.m.sequences[i].used ? c.m.sequences[i].name : `(${c.m.sequences[i].name})`}`;

const footer = (page: string): ((c: Ctx) => (SoftKeyDef | null)[]) => () => [
  { label: 'EVENTS', kind: page === 'EVENTS' ? 'current' : 'page', press: c => c.fw.setPage('EVENTS') },
  { label: 'BARS', kind: page === 'BARS' ? 'current' : 'page', press: c => c.fw.setPage('BARS') },
  { label: 'TrMOVE', kind: page === 'TRMOVE' ? 'current' : 'page', press: c => c.fw.setPage('TRMOVE') },
  null,
  { label: 'USER', kind: page === 'USER' ? 'current' : 'page', press: c => c.fw.setPage('USER') },
  page === 'EVENTS' ? { label: 'DO IT', kind: 'action', press: doEvents } : page === 'BARS' ? { label: 'DO IT', kind: 'action', press: doBars } : null,
];

function doEvents(c: Ctx) {
  const tr = trackOf(c); const from = editState.from, to = toTick(c);
  c.fw.snapshotForUndo();
  switch (editState.op) {
    case 'COPY': { const dst = c.m.sequences[editState.toSeq].tracks[editState.toTrack]; copyEvents(tr, dst, { from, to, start: editState.start, copies: editState.copies, mode: editState.mode, notes: notesFilter() }); dst.used = true; c.m.sequences[editState.toSeq].used = true; const need = Math.ceil((editState.start + (to - from) * editState.copies) / ticksPerBar(tsigAtBar(c.m.sequences[editState.toSeq].tsigs, 0))); if (c.m.sequences[editState.toSeq].bars < need) c.m.sequences[editState.toSeq].bars = need; break; }
    case 'DURATION': editDuration(tr, { type: editState.type, value: editState.value } as ValueEdit, from, to, notesFilter()); break;
    case 'VELOCITY': editVelocity(tr, { type: editState.type, value: editState.value } as ValueEdit, from, to, notesFilter()); break;
    case 'TRANSPOSE': if (tr.type === 'MIDI') transposeEvents(tr, editState.amount, from, to, null); break;
  }
  c.fw.message('DONE');
}
function doBars(c: Ctx) {
  const src = seqOf(c); const dst = c.m.sequences[editState.barsTo];
  if (editState.firstBar > src.bars) return;
  c.fw.snapshotForUndo();
  copyBars(src, dst, editState.firstBar, Math.min(editState.lastBar, src.bars), Math.min(editState.afterBar, dst.bars), editState.barCopies, ticksPerBar(tsigAtBar(src.tsigs, 0)));
  c.fw.message('DONE');
}

const timeFields = (c: Ctx): Field[] => [
  bbtField({ id: 'from', row: 1, col: 5, label: 'Time:', get: () => editState.from, set: (x, v) => { editState.from = Math.min(v, toTick(x)); } }),
  { id: 'dash', row: 1, col: 14, width: 1, get: () => '-', skip: true },
  bbtField({ id: 'to', row: 1, col: 15, label: '', get: x => toTick(x), set: (_x, v) => { editState.to = Math.max(v, editState.from); } }),
  { id: 'notes', row: 3, col: 6, width: 16, label: 'Notes:', hidden: x => trackOf(x).type === 'MIDI', get: x => (editState.note ? `${editState.note}/${['A', 'B', 'C', 'D'][Math.floor(Math.max(0, padMap(x).indexOf(editState.note)) / 16)]}${pad2((Math.max(0, padMap(x).indexOf(editState.note)) % 16) + 1)}` : 'ALL (Hit pad)'),
    wheel: (_x, d) => { const n = editState.note === 0 ? (d > 0 ? 35 : 0) : editState.note + d; editState.note = n < 35 ? 0 : Math.min(98, n); }, pad: (x, pad) => { editState.note = padMap(x)[pad]; } },
  ...(void c, []),
];

export const eventsPage: ScreenDef = {
  id: 'EDIT/EVENTS',
  fields: c => {
    const f: Field[] = [enumField({ id: 'op', row: 0, col: 5, width: 9, label: 'Edit:', values: OPS, get: () => editState.op, set: (_x, v) => { editState.op = v; } }), ...timeFields(c)];
    switch (editState.op) {
      case 'COPY':
        f.push(intField({ id: 'toSeq', row: 1, col: 31, width: 2, label: 'To sq:', min: 1, max: NUM_SEQUENCES, get: () => editState.toSeq + 1, set: (_x, v) => { editState.toSeq = v - 1; }, fmt: pad2 }));
        f.push(intField({ id: 'toTr', row: 1, col: 37, width: 2, label: 'Tr:', min: 1, max: NUM_TRACKS, get: () => editState.toTrack + 1, set: (_x, v) => { editState.toTrack = v - 1; }, fmt: pad2 }));
        f.push(enumField({ id: 'mode', row: 2, col: 29, width: 7, label: 'Mode:', values: ['REPLACE', 'MERGE'] as const, get: () => editState.mode, set: (_x, v) => { editState.mode = v; } }));
        f.push(bbtField({ id: 'start', row: 3, col: 30, label: 'Start:', get: () => editState.start, set: (_x, v) => { editState.start = v; } }));
        f.push(intField({ id: 'copies', row: 4, col: 31, width: 3, label: 'Copies:', min: 1, max: 99, get: () => editState.copies, set: (_x, v) => { editState.copies = v; } }));
        break;
      case 'DURATION': case 'VELOCITY':
        f.push(enumField({ id: 'type', row: 2, col: 29, width: 10, label: 'Mode:', values: TYPES, get: () => editState.type, set: (_x, v) => { editState.type = v; } }));
        f.push(intField({ id: 'value', row: 3, col: 30, width: 4, label: 'Value:', min: 0, max: 9999, get: () => editState.value, set: (_x, v) => { editState.value = v; } }));
        break;
      case 'TRANSPOSE':
        f.push(intField({ id: 'amount', row: 2, col: 31, width: 3, label: 'Amount:', min: -12, max: 12, get: () => editState.amount, set: (_x, v) => { editState.amount = v; }, fmt: v => `${v > 0 ? '+' : ''}${v}`.padStart(3, ' ') }));
        break;
    }
    return f;
  },
  draw(c, f) {
    text(f, 0, 24, `From sq:${pad2(c.s.seq + 1)} Tr:${pad2(c.s.track + 1)}`);
    if (editState.op === 'TRANSPOSE') text(f, 3, 24, trackOf(c).type === 'MIDI' ? 'semitones' : '(Except drum track)', ATTR_DIM);
    text(f, 6, 0, `Track ${pad2(c.s.track + 1)}-${trackOf(c).name}  ${trackOf(c).events.length} events`, ATTR_DIM);
  },
  softKeys: footer('EVENTS'),
};

export const barsPage: ScreenDef = {
  id: 'EDIT/BARS',
  fields: () => [
    intField({ id: 'first', row: 1, col: 11, width: 3, label: 'First bar:', min: 1, max: 999, get: () => editState.firstBar, set: (_x, v) => { editState.firstBar = v; if (editState.lastBar < v) editState.lastBar = v; } }),
    intField({ id: 'last', row: 2, col: 11, width: 3, label: ' Last bar:', min: 1, max: 999, get: () => Math.max(editState.lastBar, editState.firstBar), set: (_x, v) => { editState.lastBar = Math.max(v, editState.firstBar); } }),
    intField({ id: 'toSeq', row: 0, col: 34, width: 2, label: 'To Sq:', min: 1, max: NUM_SEQUENCES, get: () => editState.barsTo + 1, set: (_x, v) => { editState.barsTo = v - 1; }, fmt: pad2 }),
    intField({ id: 'after', row: 1, col: 38, width: 3, label: 'After bar:', min: 0, max: 999, get: () => editState.afterBar, set: (_x, v) => { editState.afterBar = v; } }),
    intField({ id: 'copies', row: 2, col: 38, width: 3, label: 'Copies:', min: 1, max: 99, get: () => editState.barCopies, set: (_x, v) => { editState.barCopies = v; } }),
  ],
  draw(c, f) {
    text(f, 0, 0, `From Sq:${pad2(c.s.seq + 1)}`); text(f, 0, 20, 'COPY', ATTR_DIM);
    text(f, 4, 0, `${seqLabel(c, c.s.seq)} has ${seqOf(c).bars} bars -> ${seqLabel(c, editState.barsTo)} (${c.m.sequences[editState.barsTo].bars} bars)`.slice(0, 48), ATTR_DIM);
    text(f, 5, 0, 'Bars are inserted after the chosen bar of the target.', ATTR_DIM);
  },
  softKeys: footer('BARS'),
  onEnter(c) { editState.barsTo = c.s.seq; editState.lastBar = Math.max(1, seqOf(c).bars); editState.afterBar = seqOf(c).bars; },
};

export const trMovePage: ScreenDef = {
  id: 'EDIT/TRMOVE',
  fields: () => [],
  draw(c, f) {
    const q = seqOf(c);
    text(f, 0, 0, `Sq:${seqLabel(c, c.s.seq)}`);
    const sel = editState.moveSel; const pos = editState.movePos;
    const top = clamp(pos - 2, 0, NUM_TRACKS - 5);
    for (let r = 0; r < 5; r++) {
      const i = top + r; const tr = q.tracks[i];
      const label = `${pad2(i + 1)}-${(tr.used ? tr.name : `(${tr.name})`).padEnd(16).slice(0, 16)}`;
      text(f, 1 + r, 4, label, i === pos ? ATTR_INVERSE : tr.used ? 0 : ATTR_DIM);
      if (sel === i) text(f, 1 + r, 0, '>>>');
    }
    text(f, 6, 0, sel == null ? 'Turn DATA to pick a track, then SELECT.' : `Moving Tr ${pad2(sel + 1)}: turn DATA to the new place, INSERT.`, ATTR_DIM);
  },
  softKeys: (c): (SoftKeyDef | null)[] => [
    { label: 'EVENTS', kind: 'page', press: (x: Ctx) => x.fw.setPage('EVENTS') },
    { label: 'BARS', kind: 'page', press: (x: Ctx) => x.fw.setPage('BARS') },
    { label: 'TrMOVE', kind: 'current' },
    null,
    editState.moveSel == null ? { label: 'USER', kind: 'page' as const, press: (x: Ctx) => x.fw.setPage('USER') } : { label: 'CANCEL', kind: 'action' as const, press: () => { editState.moveSel = null; } },
    editState.moveSel == null
      ? { label: 'SELECT', kind: 'action' as const, press: () => { editState.moveSel = editState.movePos; } }
      : { label: 'INSERT', kind: 'action' as const, press: (x: Ctx) => { const q = seqOf(x); const from = editState.moveSel!, to = editState.movePos; if (from !== to) { x.fw.snapshotForUndo(); const [t] = q.tracks.splice(from, 1); q.tracks.splice(to, 0, t); if (x.s.track === from) x.s.track = to; } editState.moveSel = null; } },
  ],
  onKey(c, k, down) {
    if (!down) return false;
    if (k === 'UP' || k === 'DOWN') { editState.movePos = clamp(editState.movePos + (k === 'DOWN' ? 1 : -1), 0, NUM_TRACKS - 1); return true; }
    void c; return false;
  },
  onEnter(c) { editState.movePos = c.s.track; editState.moveSel = null; },
};
// the DATA wheel on TrMOVE moves the highlight (no fields to land on)
trMovePage.fields = () => [{ id: 'pos', row: 7, col: 0, width: 0, get: () => '', wheel: (_c, d) => { editState.movePos = clamp(editState.movePos + d, 0, NUM_TRACKS - 1); } }];

export const editEntry: ScreenDef = { id: 'EDIT', fields: () => [], draw() {}, softKeys: footer('EVENTS'), onEnter(c) { if (!c.s.page.EDIT) c.fw.setPage('EVENTS'); editState.toSeq = c.s.seq; editState.toTrack = c.s.track; editState.to = -1; } };

export const editScreens: ScreenDef[] = [editEntry, eventsPage, barsPage, trMovePage];
export { formatBBT, tickToBBT, barStartTick };
