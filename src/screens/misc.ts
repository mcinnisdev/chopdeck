// MISC. mode: auto punch, playback transpose (with FIX), second sequence.
import { ScreenDef, Ctx, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { NUM_SEQUENCES, NUM_TRACKS } from '@/model/types';
import { pad2 } from '@/model/format';
import { transposeEvents } from '@/seq/events';
import { enumField, intField, clamp } from './util';
import { seqOf } from './main';
import { bbtField } from './main-windows';

export const miscState = { punchMode: 'PUNCH IN OUT' as 'PUNCH IN ONLY' | 'PUNCH OUT ONLY' | 'PUNCH IN OUT', punchIn: 0, punchOut: 384, transTrack: 0, transAmount: 0, transFirst: 1, transLast: 1, secondSeq: 1 };
const seqLabel = (c: Ctx, i: number) => `${pad2(i + 1)}-${c.m.sequences[i].used ? c.m.sequences[i].name : `(${c.m.sequences[i].name})`}`;

const footer = (page: string, last: SoftKeyDef | null): ((c: Ctx) => (SoftKeyDef | null)[]) => () => [
  { label: 'PUNCH', kind: page === 'PUNCH' ? 'current' : 'page', press: c => c.fw.setPage('PUNCH') },
  { label: 'TRANS', kind: page === 'TRANS' ? 'current' : 'page', press: c => c.fw.setPage('TRANS') },
  { label: '2ndSEQ', kind: page === '2NDSEQ' ? 'current' : 'page', press: c => c.fw.setPage('2NDSEQ') },
  null, null, last,
];

export const punchPage: ScreenDef = {
  id: 'MISC/PUNCH',
  fields: () => [
    enumField({ id: 'mode', row: 1, col: 11, width: 14, label: 'Auto punch:', values: ['PUNCH IN ONLY', 'PUNCH OUT ONLY', 'PUNCH IN OUT'] as const, get: () => miscState.punchMode, set: (_c, v) => { miscState.punchMode = v; } }),
    bbtField({ id: 'in', row: 2, col: 9, label: 'IN Time:', get: () => miscState.punchIn, set: (_c, v) => { miscState.punchIn = Math.min(v, miscState.punchOut); } }),
    bbtField({ id: 'out', row: 3, col: 9, label: 'OUT Time:', get: () => miscState.punchOut, set: (_c, v) => { miscState.punchOut = Math.max(v, miscState.punchIn); } }),
  ],
  draw(c, f) { text(f, 0, 0, 'Auto Punch In/Out'); text(f, 5, 0, c.s.punch ? 'Auto punch function is active!!' : 'Start with REC/OVERDUB + PLAY; recording happens', c.s.punch ? 0 : ATTR_DIM); if (!c.s.punch) text(f, 6, 0, 'only between IN and OUT.', ATTR_DIM); },
  softKeys: c => footer('PUNCH', c.s.punch
    ? { label: 'OFF', kind: 'action', press: x => { x.s.punch = null; } }
    : { label: 'TurnON', kind: 'action', press: x => { x.s.punch = { mode: miscState.punchMode, in: miscState.punchIn, out: miscState.punchOut }; } })(c),
};

export const transPage: ScreenDef = {
  id: 'MISC/TRANS',
  fields: () => [
    { id: 'tr', row: 0, col: 3, width: 20, label: 'Tr:', get: c => (miscState.transTrack === 0 ? '00-(ALL)' : `${pad2(miscState.transTrack)}-${seqOf(c).tracks[miscState.transTrack - 1].name}`),
      wheel: (_c, d) => { miscState.transTrack = clamp(miscState.transTrack + d, 0, NUM_TRACKS); }, enter: (_c, digits) => { miscState.transTrack = clamp(parseInt(digits, 10) || 0, 0, NUM_TRACKS); } },
    intField({ id: 'amount', row: 1, col: 17, width: 3, label: 'Transpose amount:', min: -12, max: 12, get: () => miscState.transAmount, set: (c, v) => { miscState.transAmount = v; applyTranspose(c); }, fmt: v => `${v > 0 ? '+' : ''}${v}`.padStart(3, ' ') }),
    intField({ id: 'first', row: 3, col: 4, width: 3, label: 'Bar:', min: 1, max: 999, get: () => miscState.transFirst, set: (_c, v) => { miscState.transFirst = v; if (miscState.transLast < v) miscState.transLast = v; } }),
    intField({ id: 'last', row: 3, col: 10, width: 3, label: '-', min: 1, max: 999, get: () => Math.max(miscState.transLast, miscState.transFirst), set: (_c, v) => { miscState.transLast = Math.max(v, miscState.transFirst); } }),
  ],
  draw(c, f) { text(f, 0, 24, '<Tr:00=ALL>', ATTR_DIM); text(f, 1, 22, '<except drum tr>', ATTR_DIM); text(f, 2, 0, 'Pressing FIX will change the note data permanently!!', ATTR_DIM); void c; },
  softKeys: footer('TRANS', { label: 'FIX', kind: 'action', press: c => c.fw.confirm({ title: 'Transpose permanent', lines: ['', 'Pressing DO IT will transpose the MIDI note data.'], doIt: () => {
    c.fw.snapshotForUndo();
    const q = seqOf(c);
    const tracks = miscState.transTrack === 0 ? q.tracks : [q.tracks[miscState.transTrack - 1]];
    const barTicks = 384; const from = (miscState.transFirst - 1) * barTicks, to = Math.max(miscState.transLast, miscState.transFirst) * barTicks;
    for (const t of tracks) if (t.type === 'MIDI') { transposeEvents(t, t.transpose || miscState.transAmount, from, to, null); t.transpose = 0; }
    miscState.transAmount = 0;
  } }) }),
};
function applyTranspose(c: Ctx) {
  const q = seqOf(c);
  const tracks = miscState.transTrack === 0 ? q.tracks : [q.tracks[miscState.transTrack - 1]];
  for (const t of tracks) if (t.type === 'MIDI') t.transpose = miscState.transAmount;
}

export const secondSeqPage: ScreenDef = {
  id: 'MISC/2NDSEQ',
  fields: () => [{ id: 'sq', row: 1, col: 3, width: 20, label: 'SQ:', get: c => seqLabel(c, miscState.secondSeq), wheel: (_c, d) => { miscState.secondSeq = clamp(miscState.secondSeq + d, 0, NUM_SEQUENCES - 1); }, enter: (_c, digits) => { const n = parseInt(digits, 10); if (n >= 1 && n <= NUM_SEQUENCES) miscState.secondSeq = n - 1; } }],
  draw(c, f) {
    text(f, 0, 0, 'Second sequence');
    text(f, 3, 0, 'This sequence will play simultaneously with', ATTR_DIM); text(f, 4, 0, 'the active sequence or song.', ATTR_DIM);
    if (c.s.secondSeq != null) text(f, 6, 0, `2nd sequence ON: ${seqLabel(c, c.s.secondSeq)}`);
  },
  softKeys: c => footer('2NDSEQ', c.s.secondSeq != null
    ? { label: 'OFF', kind: 'action', press: x => { x.s.secondSeq = null; } }
    : { label: 'TurnON', kind: 'action', press: x => { x.s.secondSeq = miscState.secondSeq; } })(c),
};

export const miscEntry: ScreenDef = { id: 'MISC', fields: () => [], draw() {}, softKeys: footer('PUNCH', null), onEnter(c) { if (!c.s.page.MISC) c.fw.setPage('PUNCH'); } };
export const miscScreens: ScreenDef[] = [miscEntry, punchPage, transPage, secondSeqPage];
