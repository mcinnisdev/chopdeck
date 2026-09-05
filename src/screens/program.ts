// PROGRAM mode (SHIFT+6): ASSIGN / PARAMS / DRUM / PURGE / AUTO pages and their windows.
import { ScreenDef, Ctx, Field, SoftKeyDef } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE, ATTR_NONE } from '@/lcd/frame';
import {
  NUM_PROGRAMS, NUM_DRUMS, NUM_PADS, NOTE_MIN, NOTE_MAX,
  Program, NoteParams, PlayMode, DecayMode, VoiceOverlap, Sound,
} from '@/model/types';
import { newProgram, defaultPadToNote } from '@/model/factory';
import { padName, notePad, noteName, lpad, rpad } from '@/model/format';
import { intField, enumField, nameField, textField, clamp } from './util';

// ---------- constants ----------
const PAGES = ['ASSIGN', 'PARAMS', 'DRUM', 'PURGE', 'AUTO'] as const;
type PageId = typeof PAGES[number];
const PLAY_MODES: readonly PlayMode[] = ['NORMAL', 'SIMULT', 'VEL SW', 'DCY SW'];
const DECAY_MODES: readonly DecayMode[] = ['END', 'START'];
const OVERLAPS: readonly VoiceOverlap[] = ['POLY', 'MONO', 'NOTE OFF'];
const RECEIVE_IGNORE = ['RECEIVE', 'IGNORE'] as const;
const PAD_ASSIGNS = ['PROGRAM', 'MASTER'] as const;
const BANKS = ['A', 'B', 'C', 'D'] as const;
const TUNE_MIN = -120;
const TUNE_MAX = 120;

/** Numeric NoteParams keys editable through a plain int field. */
type NpNum = 'attack' | 'decay' | 'veloAttack' | 'veloStart' | 'veloLevel' | 'freq' | 'reson'
  | 'fenvAttack' | 'fenvDecay' | 'fenvAmount' | 'veloFreq' | 'tune' | 'veloPitch';

// ---------- model accessors ----------
const pgmOf = (c: Ctx): Program => c.m.programs[c.s.program];
const padMap = (c: Ctx, p: Program = pgmOf(c)): number[] => (p.padAssign === 'MASTER' ? c.m.masterPadToNote : p.padToNote);
const np = (c: Ctx, note: number = c.s.note, p: Program = pgmOf(c)): NoteParams => p.notes[clamp(note, NOTE_MIN, NOTE_MAX) - NOTE_MIN];
const soundById = (c: Ctx, id: string | null): Sound | undefined => (id == null ? undefined : c.m.sounds.find(x => x.id === id));
const sndName = (c: Ctx, id: string | null): string => soundById(c, id)?.name ?? 'OFF';
const pgmLabel = (c: Ctx, i: number) => `${lpad(i + 1, 2)}-${c.m.programs[i].name}`;
const noteKey = (note: number) => `${note}/${noteName(note)}`;
const noteLabel = (c: Ctx, note: number) => `${noteKey(note)}-${sndName(c, np(c, note).snd)}`;
const noteOrOffStr = (note: number) => (note === 0 ? '--/OFF' : noteKey(note));
const signed = (v: number) => (v > 0 ? `+${v}` : String(v)).padStart(4, ' ');
const firstUnused = (c: Ctx) => c.m.programs.findIndex(p => !p.used);

function selectProgram(c: Ctx, i: number) {
  c.s.program = clamp(i, 0, NUM_PROGRAMS - 1);
  c.m.drums[c.s.drum].pgm = c.s.program;
}
function selectDrum(c: Ctx, d: number) {
  c.s.drum = clamp(d, 0, NUM_DRUMS - 1);
  c.s.program = c.m.drums[c.s.drum].pgm;
}
function selectPad(c: Ctx, pad: number) {
  c.s.pad = clamp(pad, 0, NUM_PADS - 1);
  c.s.note = padMap(c)[c.s.pad];
}
function sndDisplay(c: Ctx): string {
  const s = soundById(c, np(c).snd);
  if (!s) return 'OFF';
  return s.channels === 2 && s.name.length + 4 <= 16 ? `${s.name}(ST)` : s.name;
}
function wheelSound(c: Ctx, d: number) {
  const n = np(c);
  const idx = n.snd == null ? 0 : c.m.sounds.findIndex(x => x.id === n.snd) + 1;
  const next = clamp(idx + d, 0, c.m.sounds.length);
  n.snd = next === 0 ? null : c.m.sounds[next - 1].id;
  if (n.snd) pgmOf(c).used = true;
  c.fw.touch();
}
function usedSoundIds(c: Ctx): Set<string> {
  const used = new Set<string>();
  for (const p of c.m.programs) for (const n of p.notes) if (n.snd) used.add(n.snd);
  return used;
}

// ---------- window params ----------
const param = <T,>(c: Ctx, key: string, dflt: T): T => {
  const v = c.s.windows[c.s.windows.length - 1]?.params?.[key];
  return v === undefined ? dflt : (v as T);
};
const setParam = (c: Ctx, key: string, v: unknown) => {
  const w = c.s.windows[c.s.windows.length - 1];
  if (w) w.params = { ...w.params, [key]: v };
};

// ---------- field helpers ----------
/** Same behaviour as an intField, different display text (needs the ctx). */
const display = (f: Field, get: (c: Ctx) => string): Field => ({ ...f, get });

/** Note number where 0 = OFF; the wheel drops to OFF below NOTE_MIN and climbs back to NOTE_MIN from OFF. */
function noteOrOffField(opts: {
  id: string; row: number; col: number; width: number; label?: string;
  get: (c: Ctx) => number; set: (c: Ctx, v: number) => void;
  fmt?: (c: Ctx, v: number) => string; hidden?: (c: Ctx) => boolean; window?: (c: Ctx) => void;
}): Field {
  const fmt = opts.fmt ?? ((_c: Ctx, v: number) => noteOrOffStr(v));
  const commit = (c: Ctx, n: number) => { opts.set(c, n < NOTE_MIN ? 0 : Math.min(NOTE_MAX, n)); c.fw.touch(); };
  return {
    id: opts.id, row: opts.row, col: opts.col, width: opts.width, label: opts.label, hidden: opts.hidden, window: opts.window,
    get: c => fmt(c, opts.get(c)),
    wheel: (c, d) => { const cur = opts.get(c); commit(c, cur === 0 ? (d > 0 ? NOTE_MIN + d - 1 : 0) : cur + d); },
    enter: (c, digits) => { const n = parseInt(digits, 10); if (!isNaN(n)) commit(c, n); },
  };
}

const npInt = (key: NpNum, row: number, col: number, width: number, label: string, min: number, max: number, extra?: { fmt?: (v: number) => string; window?: (c: Ctx) => void }): Field =>
  intField({ id: key, row, col, width, label, min, max, get: c => np(c)[key], set: (c, v) => { np(c)[key] = v; }, fmt: extra?.fmt, window: extra?.window });

const readOnly = (id: string, row: number, col: number, width: number, label: string, get: (c: Ctx) => string): Field =>
  ({ id, row, col, width, label, get, skip: true });
const veloRow = (row: number): Field => readOnly('velo', row, 14, 3, 'Velo:', c => lpad(c.s.lastVel, 3));

const pgmField = (row: number, window?: (c: Ctx) => void): Field =>
  intField({ id: 'pgm', row, col: 4, width: 2, label: 'Pgm:', min: 1, max: NUM_PROGRAMS, get: c => c.s.program + 1, set: (c, v) => selectProgram(c, v - 1), window });
const pgmNameText = (row: number): Field[] => [
  textField('pgmDash', row, 6, 1, () => '-'),
  textField('pgmName', row, 7, 16, c => pgmOf(c).name),
];

// ---------- soft keys ----------
const closeKey: SoftKeyDef = { label: 'CLOSE', kind: 'action', press: c => c.fw.closeWindow() };
const cancelKey: SoftKeyDef = { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() };
const playKey: SoftKeyDef = {
  label: 'PLAY', kind: 'action',
  press: c => c.fw.sound.noteOn(c.s.drum, c.s.note, 127),
  release: c => c.fw.sound.noteOff(c.s.drum, c.s.note),
};
const openWin = (id: string) => (c: Ctx) => c.fw.openWindow(id);

function openAutoChromatic(c: Ctx) {
  c.fw.openWindow('PROGRAM/AUTO_CHROMATIC', { source: c.s.note, orig: c.s.note, tune: 0, name: pgmOf(c).name });
}
function gotoPage(c: Ctx, p: PageId) {
  c.fw.setPage(p);
  if (p === 'AUTO') openAutoChromatic(c);
}
function pageKeys(cur: PageId, last: SoftKeyDef): (SoftKeyDef | null)[] {
  return [
    ...PAGES.map<SoftKeyDef>(p => (p === cur ? { label: p, kind: 'current' } : { label: p, kind: 'page', press: c => gotoPage(c, p) })),
    last,
  ];
}

// ---------- shared page behaviour ----------
/** Pad hit anywhere in PROGRAM mode selects that pad and its note; the kernel still plays it. */
const padSelect: NonNullable<ScreenDef['onPad']> = (c, pad, _vel, down) => { if (down) selectPad(c, pad); return false; };
/** Entering the mode asks which DRUM to edit. */
const enterMode = (c: Ctx) => c.fw.openWindow('PROGRAM/SELECT_DRUM');

// ================= ASSIGN page =================
const openProgramWindow = openWin('PROGRAM/PROGRAM');
const openAssignView = openWin('PROGRAM/ASSIGN_VIEW');
const altNoteFmt = (c: Ctx, v: number) => (v === 0 ? '--/OFF' : notePad(v, padMap(c)));

const assignFields = (): Field[] => {
  const notSimult = (c: Ctx) => np(c).mode !== 'SIMULT';
  const notSwitch = (c: Ctx) => np(c).mode !== 'VEL SW' && np(c).mode !== 'DCY SW';
  const altRows: Field[] = [];
  ([0, 1] as const).forEach(i => {
    const row = 4 + i;
    altRows.push(noteOrOffField({ id: `also${i}`, row, col: 15, width: 6, label: 'Also play note:', hidden: notSimult,
      get: c => np(c).alt[i].note, set: (c, v) => { np(c).alt[i].note = v; }, fmt: altNoteFmt }));
    altRows.push(intField({ id: `over${i}`, row, col: 8, width: 3, label: 'If over:', min: 0, max: 127, hidden: notSwitch,
      get: c => np(c).alt[i].over, set: (c, v) => { np(c).alt[i].over = v; } }));
    altRows.push(noteOrOffField({ id: `use${i}`, row, col: 17, width: 6, label: ', use:', hidden: notSwitch,
      get: c => np(c).alt[i].note, set: (c, v) => { np(c).alt[i].note = v; }, fmt: altNoteFmt }));
  });
  return [
    pgmField(0, openProgramWindow),
    textField('pgmDash', 0, 6, 1, () => '-'),
    nameField({ id: 'pgmName', row: 0, col: 7, get: c => pgmOf(c).name, set: (c, n) => { pgmOf(c).name = n; pgmOf(c).used = true; }, window: openProgramWindow }),
    { id: 'pad', row: 1, col: 4, width: 3, label: 'Pad:', get: c => padName(c.s.pad), wheel: (c, d) => { selectPad(c, c.s.pad + d); c.fw.touch(); }, window: openAssignView },
    intField({ id: 'padNote', row: 1, col: 13, width: 2, label: '=Note:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => padMap(c)[c.s.pad], set: (c, v) => { padMap(c)[c.s.pad] = v; c.s.note = v; }, window: openAssignView }),
    enumField({ id: 'padAssign', row: 1, col: 31, width: 7, label: 'Pad assign:', values: PAD_ASSIGNS,
      get: c => pgmOf(c).padAssign, set: (c, v) => { pgmOf(c).padAssign = v; },
      window: c => c.fw.openWindow('PROGRAM/INIT_PAD_ASSIGN', { target: pgmOf(c).padAssign }) }),
    intField({ id: 'note', row: 2, col: 5, width: 2, label: 'Note:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => c.s.note, set: (c, v) => { c.s.note = v; }, window: openAssignView }),
    { id: 'snd', row: 2, col: 12, width: 16, label: '=Snd:', get: sndDisplay, wheel: wheelSound, window: openWin('TRIM/SOUND') },
    enumField({ id: 'mode', row: 3, col: 5, width: 6, label: 'Mode:', values: PLAY_MODES, get: c => np(c).mode, set: (c, v) => { np(c).mode = v; } }),
    ...altRows,
  ];
};

const assignPage: ScreenDef = {
  id: 'PROGRAM/ASSIGN',
  fields: assignFields,
  draw() {},
  softKeys: () => pageKeys('ASSIGN', playKey),
  onPad: padSelect,
  onEnter: enterMode,
};

/** Bare mode id: behaves as ASSIGN and asks for the DRUM on entry. */
const programRoot: ScreenDef = {
  ...assignPage,
  id: 'PROGRAM',
  onEnter: c => { c.fw.setPage('ASSIGN'); enterMode(c); },
};

const selectDrumWindow: ScreenDef = {
  id: 'PROGRAM/SELECT_DRUM', title: 'Select DRUM',
  fields: () => [],
  draw(c, f) {
    text(f, 3, 2, 'Select the DRUM to edit.');
    text(f, 4, 2, `Drum:${c.s.drum + 1}  Pgm:${pgmLabel(c, c.m.drums[c.s.drum].pgm)}`, ATTR_DIM);
  },
  softKeys: () => [
    ...[0, 1, 2, 3].map<SoftKeyDef>(d => ({ label: `DRUM ${d + 1}`, kind: 'action', press: c => { selectDrum(c, d); c.fw.closeWindow(); } })),
    null,
    closeKey,
  ],
};

const assignViewWindow: ScreenDef = {
  id: 'PROGRAM/ASSIGN_VIEW', title: 'Assignment View',
  fields: () => [
    enumField({ id: 'bank', row: 2, col: 5, width: 1, label: 'Bank:', values: BANKS, get: c => BANKS[clamp(c.s.padBank, 0, 3)], set: (c, v) => { c.s.padBank = BANKS.indexOf(v); } }),
  ],
  draw(c, f) {
    const map = padMap(c);
    const note = map[c.s.pad];
    text(f, 2, 8, `Note:${note}=${sndName(c, np(c, note).snd)}`);
    // 4x4 grid laid out like the pads: 13..16 on top, 1..4 on the bottom
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 4; col++) {
        const pad = clamp(c.s.padBank, 0, 3) * 16 + (3 - r) * 4 + col;
        const s = soundById(c, np(c, map[pad]).snd);
        text(f, 3 + r, col * 12, rpad(s ? s.name.slice(0, 10) : '---', 10), pad === c.s.pad ? ATTR_INVERSE : ATTR_NONE);
      }
    }
  },
  softKeys: () => [null, null, null, closeKey, null, null],
  onPad: padSelect,
};

const initPadAssignWindow: ScreenDef = {
  id: 'PROGRAM/INIT_PAD_ASSIGN', title: 'Initialize Pad Assign',
  fields: () => [
    enumField({ id: 'target', row: 3, col: 24, width: 7, label: 'Initialize pad assign:', values: PAD_ASSIGNS,
      get: c => param(c, 'target', pgmOf(c).padAssign), set: (c, v) => setParam(c, 'target', v) }),
  ],
  draw(_c, f) { text(f, 5, 2, 'Pressing DO IT will reset the pad assignment.', ATTR_DIM); },
  softKeys: () => [
    null, null, null, closeKey,
    { label: 'DO IT', kind: 'action', press: c => {
      if (param(c, 'target', pgmOf(c).padAssign) === 'MASTER') c.m.masterPadToNote = defaultPadToNote();
      else pgmOf(c).padToNote = defaultPadToNote();
      c.fw.closeWindow();
    } },
    null,
  ],
};

const programWindow: ScreenDef = {
  id: 'PROGRAM/PROGRAM', title: 'Program',
  fields: () => [
    nameField({ id: 'name', row: 3, col: 22, label: 'Program name:', get: c => pgmOf(c).name, set: (c, n) => { pgmOf(c).name = n; pgmOf(c).used = true; } }),
    intField({ id: 'midiPgm', row: 4, col: 22, width: 3, label: 'MIDI program change:', min: 1, max: 128, get: c => pgmOf(c).midiPgm, set: (c, v) => { pgmOf(c).midiPgm = v; } }),
  ],
  draw() {},
  softKeys: () => [
    null,
    { label: 'DELETE', kind: 'action', press: c => c.fw.confirm({
      title: 'Delete Program',
      lines: [`Pgm:${pgmLabel(c, c.s.program)}`, '', 'Pressing DO IT will erase this program!!'],
      doIt: () => { c.m.programs[c.s.program] = newProgram(c.s.program); c.fw.closeAllWindows(); },
      extra: { index: 2, label: 'ALLpgm', run: () => c.fw.confirm({
        title: 'Delete ALL Programs', lines: ['', 'Pressing DO IT will erase ALL programs!!'],
        doIt: () => { c.m.programs = c.m.programs.map((_, i) => newProgram(i)); c.fw.closeAllWindows(); },
      }) },
    }) },
    { label: 'NEW', kind: 'action', press: c => {
      const slot = firstUnused(c);
      const idx = slot < 0 ? c.s.program : slot;
      c.fw.openWindow('PROGRAM/NEW_PROGRAM', { name: newProgram(idx).name, midiPgm: idx + 1 });
    } },
    closeKey,
    { label: 'COPY', kind: 'action', press: c => c.fw.openWindow('PROGRAM/COPY_PROGRAM', { to: (c.s.program + 1) % NUM_PROGRAMS }) },
    null,
  ],
};

const newProgramWindow: ScreenDef = {
  id: 'PROGRAM/NEW_PROGRAM', title: 'Create New Program',
  fields: () => [
    nameField({ id: 'name', row: 3, col: 22, label: 'New name:', get: c => param(c, 'name', ''), set: (c, n) => setParam(c, 'name', n) }),
    intField({ id: 'midiPgm', row: 4, col: 22, width: 3, label: 'MIDI program change:', min: 1, max: 128, get: c => param(c, 'midiPgm', 1), set: (c, v) => setParam(c, 'midiPgm', v) }),
  ],
  draw() {},
  softKeys: () => [
    null, null, null, cancelKey,
    { label: 'DO IT', kind: 'action', press: c => {
      const slot = firstUnused(c);
      if (slot >= 0) {
        const p = newProgram(slot, param(c, 'name', newProgram(slot).name));
        p.used = true;
        p.midiPgm = param(c, 'midiPgm', slot + 1);
        c.m.programs[slot] = p;
        selectProgram(c, slot);
      }
      c.fw.closeAllWindows();
    } },
    null,
  ],
};

const copyProgramWindow: ScreenDef = {
  id: 'PROGRAM/COPY_PROGRAM', title: 'Copy Program',
  fields: () => [
    intField({ id: 'to', row: 5, col: 6, width: 2, label: 'Pgm:', min: 1, max: NUM_PROGRAMS,
      get: c => param(c, 'to', c.s.program) + 1, set: (c, v) => setParam(c, 'to', v - 1) }),
    textField('toName', 5, 8, 17, c => `-${c.m.programs[param(c, 'to', c.s.program)].name}`),
  ],
  draw(c, f) {
    text(f, 3, 2, `Pgm=${pgmLabel(c, c.s.program)}`);
    text(f, 4, 12, '>>> copy to >>>', ATTR_DIM);
  },
  softKeys: () => [
    null, null, null, cancelKey,
    { label: 'DO IT', kind: 'action', press: c => {
      const to = param(c, 'to', c.s.program);
      c.m.programs[to] = structuredClone(c.m.programs[c.s.program]);
      c.fw.closeAllWindows();
    } },
    null,
  ],
};

// ================= PARAMS page =================
const paramsPage: ScreenDef = {
  id: 'PROGRAM/PARAMS',
  fields: () => [
    pgmField(0),
    display(intField({ id: 'note', row: 0, col: 13, width: 23, label: 'Note:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => c.s.note, set: (c, v) => { c.s.note = v; },
      window: c => c.fw.openWindow('PROGRAM/COPY_NOTE', { srcPgm: c.s.program, srcNote: c.s.note, dstPgm: c.s.program, dstNote: Math.min(NOTE_MAX, c.s.note + 1) }) }),
      c => noteLabel(c, c.s.note)),
    npInt('tune', 1, 35, 4, 'Tune:', TUNE_MIN, TUNE_MAX, { fmt: signed, window: openWin('PROGRAM/VELO_PITCH') }),
    npInt('attack', 2, 7, 3, 'Attack:', 0, 100, { window: openWin('PROGRAM/VELO_ENV') }),
    npInt('freq', 2, 21, 3, 'Freq:', 0, 100, { window: openWin('PROGRAM/VELO_FILTER') }),
    npInt('decay', 3, 6, 3, 'Decay:', 0, 100, { window: openWin('PROGRAM/VELO_ENV') }),
    npInt('reson', 3, 22, 3, 'Reson:', 0, 100, { window: openWin('PROGRAM/VELO_FILTER') }),
    enumField({ id: 'dcyMode', row: 4, col: 7, width: 5, label: 'Dcy md:', values: DECAY_MODES, get: c => np(c).dcyMode, set: (c, v) => { np(c).dcyMode = v; }, window: openWin('PROGRAM/VELO_ENV') }),
    enumField({ id: 'overlap', row: 4, col: 30, width: 8, values: OVERLAPS, get: c => np(c).overlap, set: (c, v) => { np(c).overlap = v; }, window: openWin('PROGRAM/MUTE_ASSIGN') }),
  ],
  draw(_c, f) {
    text(f, 1, 0, '<Envelope>');
    text(f, 1, 16, '<Filter>');
    text(f, 2, 30, 'Voice');
    text(f, 3, 30, 'Overlap:');
  },
  softKeys: () => pageKeys('PARAMS', playKey),
  onPad: padSelect,
  onEnter: enterMode,
};

const paramWindowKeys: (SoftKeyDef | null)[] = [null, null, null, closeKey, null, playKey];

const veloEnvWindow: ScreenDef = {
  id: 'PROGRAM/VELO_ENV', title: 'Velo>>Envelope',
  fields: () => [
    npInt('veloAttack', 2, 14, 3, 'Velo>Attack:', 0, 100),
    npInt('veloStart', 3, 14, 3, 'Velo>Start:', 0, 100),
    npInt('veloLevel', 4, 14, 3, 'Velo>Level:', 0, 100),
    veloRow(5),
  ],
  draw() {},
  softKeys: () => paramWindowKeys,
  onPad: padSelect,
};

const veloFilterWindow: ScreenDef = {
  id: 'PROGRAM/VELO_FILTER', title: 'Velo/Env>>Filter',
  fields: () => [
    npInt('fenvAttack', 2, 14, 3, 'Attack:', 0, 100),
    npInt('fenvDecay', 3, 14, 3, 'Decay:', 0, 100),
    npInt('fenvAmount', 4, 14, 3, 'Amount:', 0, 100),
    npInt('veloFreq', 5, 14, 3, 'Velo>Freq:', 0, 100),
    veloRow(6),
  ],
  draw() {},
  softKeys: () => paramWindowKeys,
  onPad: padSelect,
};

const veloPitchWindow: ScreenDef = {
  id: 'PROGRAM/VELO_PITCH', title: 'Velo>>Pitch',
  fields: () => [
    npInt('tune', 2, 14, 4, 'Tune:', TUNE_MIN, TUNE_MAX, { fmt: signed }),
    readOnly('progTempo', 3, 14, 5, 'Prog tempo:', () => '---.-'),
    npInt('veloPitch', 4, 14, 4, 'Velo>Pitch:', TUNE_MIN, TUNE_MAX, { fmt: signed }),
    veloRow(5),
  ],
  draw() {},
  softKeys: () => paramWindowKeys,
  onPad: padSelect,
};

const muteAssignWindow: ScreenDef = {
  id: 'PROGRAM/MUTE_ASSIGN', title: 'Mute Assign',
  fields: () => ([0, 1] as const).map(i => noteOrOffField({ id: `mute${i}`, row: 4 + i, col: 9, width: 6, label: 'Note:',
    get: c => np(c).mutes[i], set: (c, v) => { np(c).mutes[i] = v; } })),
  draw(c, f) {
    text(f, 2, 2, `Note:${noteLabel(c, c.s.note)}`);
    text(f, 3, 2, 'Mutes off:');
  },
  softKeys: () => paramWindowKeys,
  onPad: padSelect,
};

const copyNoteWindow: ScreenDef = {
  id: 'PROGRAM/COPY_NOTE', title: 'Copy Note Parameters',
  fields: () => {
    const pgmSel = (id: string, row: number, dflt: (c: Ctx) => number) => intField({ id, row, col: 7, width: 2, label: 'Prog:', min: 1, max: NUM_PROGRAMS,
      get: c => param(c, id, dflt(c)) + 1, set: (c, v) => setParam(c, id, v - 1) });
    const noteSel = (id: string, row: number, dflt: (c: Ctx) => number) => intField({ id, row, col: 16, width: 6, label: 'Note:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => param(c, id, dflt(c)), set: (c, v) => setParam(c, id, v), fmt: noteKey });
    return [
      pgmSel('srcPgm', 3, c => c.s.program), noteSel('srcNote', 3, c => c.s.note),
      pgmSel('dstPgm', 5, c => c.s.program), noteSel('dstNote', 5, c => Math.min(NOTE_MAX, c.s.note + 1)),
    ];
  },
  draw(_c, f) { text(f, 4, 12, '>>> copy to >>>', ATTR_DIM); },
  softKeys: () => [
    null, null, null, cancelKey,
    { label: 'DO IT', kind: 'action', press: c => {
      const sp = c.m.programs[param(c, 'srcPgm', c.s.program)];
      const dp = c.m.programs[param(c, 'dstPgm', c.s.program)];
      const sn = param(c, 'srcNote', c.s.note);
      const dn = param(c, 'dstNote', Math.min(NOTE_MAX, c.s.note + 1));
      const copy = structuredClone(np(c, sn, sp));
      dp.notes[clamp(dn, NOTE_MIN, NOTE_MAX) - NOTE_MIN] = copy;
      if (copy.snd) dp.used = true;
      c.fw.closeAllWindows();
    } },
    null,
  ],
};

// ================= DRUM page =================
const drumOf = (c: Ctx) => c.m.drums[c.s.drum];

const drumPage: ScreenDef = {
  id: 'PROGRAM/DRUM',
  fields: () => [
    intField({ id: 'drum', row: 0, col: 5, width: 1, label: 'Drum:', min: 1, max: NUM_DRUMS, get: c => c.s.drum + 1, set: (c, v) => selectDrum(c, v - 1) }),
    { id: 'padToInternal', row: 0, col: 44, width: 3, label: 'Pad to internal sound:',
      get: c => (drumOf(c).padToInternal ? 'ON' : 'OFF').padStart(3, ' '),
      wheel: (c, d) => { drumOf(c).padToInternal = d > 0; c.fw.touch(); } },
    intField({ id: 'pgm', row: 1, col: 4, width: 2, label: 'Pgm:', min: 1, max: NUM_PROGRAMS, get: c => drumOf(c).pgm + 1, set: (c, v) => selectProgram(c, v - 1) }),
    ...pgmNameText(1),
    enumField({ id: 'pgmChange', row: 2, col: 15, width: 7, label: 'Program Change:', values: RECEIVE_IGNORE, get: c => drumOf(c).pgmChange, set: (c, v) => { drumOf(c).pgmChange = v; } }),
    enumField({ id: 'midiVolume', row: 3, col: 12, width: 7, label: 'MIDI volume:', values: RECEIVE_IGNORE, get: c => drumOf(c).midiVolume, set: (c, v) => { drumOf(c).midiVolume = v; } }),
    intField({ id: 'currentVol', row: 3, col: 35, width: 3, label: 'Current val.:', min: 0, max: 127, get: c => drumOf(c).currentVol, set: (c, v) => { drumOf(c).currentVol = v; } }),
  ],
  draw() {},
  softKeys: () => pageKeys('DRUM', playKey),
  onPad: padSelect,
  onEnter: enterMode,
};

// ================= PURGE page =================
const purgePage: ScreenDef = {
  id: 'PROGRAM/PURGE',
  fields: () => [pgmField(0), ...pgmNameText(0)],
  draw(c, f) {
    const used = usedSoundIds(c);
    const unused = c.m.sounds.filter(s => !used.has(s.id)).length;
    text(f, 2, 0, 'Pressing DO IT will erase all sounds not used');
    text(f, 3, 0, 'in any program in memory.');
    text(f, 4, 0, `${unused} sounds not used in any program.`);
  },
  softKeys: () => pageKeys('PURGE', { label: 'DO IT', kind: 'action', press: c => {
    const used = usedSoundIds(c);
    c.m.sounds = c.m.sounds.filter(s => used.has(s.id));
    c.s.sound = clamp(c.s.sound, 0, Math.max(0, c.m.sounds.length - 1));
    c.fw.touch();
  } }),
  onPad: padSelect,
  onEnter: enterMode,
};

// ================= AUTO page =================
const autoPage: ScreenDef = {
  id: 'PROGRAM/AUTO',
  fields: () => [pgmField(0), ...pgmNameText(0)],
  draw() {},
  softKeys: () => pageKeys('AUTO', playKey),
  onPad: padSelect,
  // Re-entering the mode on this page falls back to ASSIGN (the window is what AUTO is).
  onEnter: c => { c.fw.setPage('ASSIGN'); enterMode(c); },
};

const autoChromaticWindow: ScreenDef = {
  id: 'PROGRAM/AUTO_CHROMATIC', title: 'Auto Chromatic Assignment',
  fields: () => [
    display(intField({ id: 'source', row: 2, col: 15, width: 23, label: 'Source:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => param(c, 'source', c.s.note), set: (c, v) => setParam(c, 'source', v) }), c => noteLabel(c, param(c, 'source', c.s.note))),
    intField({ id: 'orig', row: 3, col: 15, width: 6, label: 'Original key:', min: NOTE_MIN, max: NOTE_MAX,
      get: c => param(c, 'orig', c.s.note), set: (c, v) => setParam(c, 'orig', v), fmt: noteKey }),
    intField({ id: 'tune', row: 4, col: 15, width: 4, label: 'Tune:', min: TUNE_MIN, max: TUNE_MAX,
      get: c => param(c, 'tune', 0), set: (c, v) => setParam(c, 'tune', v), fmt: signed }),
    nameField({ id: 'name', row: 5, col: 15, label: 'Program name:', get: c => param(c, 'name', pgmOf(c).name), set: (c, n) => setParam(c, 'name', n) }),
  ],
  draw() {},
  softKeys: () => [
    null, null, null,
    { label: 'CANCEL', kind: 'action', press: c => { c.fw.closeWindow(); c.fw.setPage('ASSIGN'); } },
    { label: 'DO IT', kind: 'action', press: c => {
      const p = pgmOf(c);
      const source = param(c, 'source', c.s.note);
      const orig = param(c, 'orig', c.s.note);
      const tune = param(c, 'tune', 0);
      const name = param(c, 'name', p.name);
      const src = structuredClone(np(c, source, p));
      for (let n = NOTE_MIN; n <= NOTE_MAX; n++) {
        const x = structuredClone(src);
        x.tune = clamp(tune + (n - orig) * 10, TUNE_MIN, TUNE_MAX);
        p.notes[n - NOTE_MIN] = x;
      }
      p.name = name;
      p.used = true;
      c.fw.closeAllWindows();
      c.fw.setPage('ASSIGN');
    } },
    null,
  ],
  onPad: (c, pad, _vel, down) => { if (down) setParam(c, 'source', padMap(c)[pad]); return false; },
};

export const programScreens: ScreenDef[] = [
  programRoot, assignPage, paramsPage, drumPage, purgePage, autoPage,
  selectDrumWindow, assignViewWindow, initPadAssignWindow, programWindow, newProgramWindow, copyProgramWindow,
  veloEnvWindow, veloFilterWindow, veloPitchWindow, muteAssignWindow, copyNoteWindow,
  autoChromaticWindow,
];
