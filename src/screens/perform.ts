// Performance features: the 16 LEVELS window and the NOTE VARIATION ASSIGN screen.
import { ScreenDef, Ctx } from '@/kernel/screen';
import { text, ATTR_DIM } from '@/lcd/frame';
import { NOTE_MIN, NOTE_MAX, NvParam } from '@/model/types';
import { notePad, pad2 } from '@/model/format';
import { intField, enumField } from './util';

const NV_PARAMS: readonly NvParam[] = ['TUNING', 'DECAY', 'ATTACK', 'FILTER'];
const NV_RANGE: Record<NvParam, [number, number]> = { TUNING: [-120, 120], DECAY: [0, 100], ATTACK: [0, 100], FILTER: [-50, 50] };

function programMap(c: Ctx): number[] {
  const t = c.fw as unknown as { padTarget?: (p: number) => { program: number } };
  void t;
  const pg = c.m.programs[c.m.drums[c.s.drum].pgm];
  return pg.padAssign === 'MASTER' ? c.m.masterPadToNote : pg.padToNote;
}
function soundName(c: Ctx, note: number): string {
  const pg = c.m.programs[c.m.drums[c.s.drum].pgm];
  const id = pg.notes[note - NOTE_MIN]?.snd;
  return c.m.sounds.find(s => s.id === id)?.name ?? 'OFF';
}
const noteLabel = (c: Ctx, note: number) => `${notePad(note, programMap(c))}-${soundName(c, note)}`;

export const sixteenLevelsWindow: ScreenDef = {
  id: 'SIXTEEN_LEVELS', title: 'Assign 16 levels',
  fields: c => [
    { id: 'note', row: 2, col: 8, width: 24, label: 'Note :', get: x => noteLabel(x, x.s.sixteen.note),
      wheel: (x, d) => { x.s.sixteen.note = Math.max(NOTE_MIN, Math.min(NOTE_MAX, x.s.sixteen.note + d)); },
      pad: (x, pad) => { x.s.sixteen.note = programMap(x)[pad]; } },
    enumField({ id: 'param', row: 3, col: 6, width: 8, label: 'Param:', values: ['VELOCITY', 'NOTE VAR'] as const, get: x => x.s.sixteen.param, set: (x, v) => { x.s.sixteen.param = v; } }),
    enumField({ id: 'type', row: 4, col: 5, width: 7, label: 'Type:', values: NV_PARAMS, get: x => x.s.sixteen.type, set: (x, v) => { x.s.sixteen.type = v; }, hidden: x => x.s.sixteen.param !== 'NOTE VAR' }),
    intField({ id: 'orig', row: 4, col: 32, width: 2, label: 'Original key pad:', min: 1, max: 16, get: x => x.s.sixteen.origPad, set: (x, v) => { x.s.sixteen.origPad = v; }, hidden: x => x.s.sixteen.param !== 'NOTE VAR' || x.s.sixteen.type !== 'TUNING' }),
    ...(c.s.sixteen.param === 'NOTE VAR' ? [] : []),
  ],
  draw(c, f) {
    if (c.s.sixteen.param === 'VELOCITY') text(f, 4, 2, 'Pad 1 = softest ... Pad 16 = loudest', ATTR_DIM);
  },
  softKeys: () => [null, null, null,
    { label: 'CANCEL', kind: 'action', press: c => c.fw.closeWindow() },
    { label: 'TurnON', kind: 'action', press: c => { c.s.sixteenLevels = true; c.fw.closeWindow(); } },
    null],
};

export const assignScreen: ScreenDef = {
  id: 'ASSIGN',
  fields: () => [
    { id: 'note', row: 0, col: 12, width: 24, label: 'Assign note:', get: c => (c.m.noteVariation.note ? noteLabel(c, c.m.noteVariation.note) : '--/OFF'),
      wheel: (c, d) => { const n = c.m.noteVariation.note; const next = n === 0 ? (d > 0 ? NOTE_MIN : 0) : n + d; c.m.noteVariation.note = next < NOTE_MIN ? 0 : Math.min(NOTE_MAX, next); },
      pad: (c, pad) => { c.m.noteVariation.note = programMap(c)[pad]; } },
    enumField({ id: 'param', row: 1, col: 10, width: 7, label: 'Parameter:', values: NV_PARAMS, get: c => c.m.noteVariation.param,
      set: (c, v) => { c.m.noteVariation.param = v; const [lo, hi] = NV_RANGE[v]; c.m.noteVariation.low = lo; c.m.noteVariation.high = hi; } }),
    intField({ id: 'high', row: 1, col: 30, width: 4, label: 'High range:', min: -120, max: 120, get: c => c.m.noteVariation.high,
      set: (c, v) => { const [lo, hi] = NV_RANGE[c.m.noteVariation.param]; c.m.noteVariation.high = Math.max(lo, Math.min(hi, v)); }, fmt: v => String(v).padStart(4, ' ') }),
    intField({ id: 'low', row: 2, col: 30, width: 4, label: 'Low range:', min: -120, max: 120, get: c => c.m.noteVariation.low,
      set: (c, v) => { const [lo, hi] = NV_RANGE[c.m.noteVariation.param]; c.m.noteVariation.low = Math.max(lo, Math.min(hi, v)); }, fmt: v => String(v).padStart(4, ' ') }),
    intField({ id: 'cc', row: 4, col: 32, width: 3, label: 'Assign NV slider to ctrl change:', min: 0, max: 127, get: c => c.m.noteVariation.cc, set: (c, v) => { c.m.noteVariation.cc = v; }, fmt: v => (v === 0 ? 'OFF' : String(v).padStart(3, ' ')) }),
  ],
  draw(c, f) {
    text(f, 6, 0, `Slider:${pad2(Math.round((c.s.nvValue / 127) * 99))}  AFTER:${c.s.after ? 'ON ' : 'OFF'}`, ATTR_DIM);
  },
  softKeys: () => [null, null, null, null, null, null],
};

export const performScreens = [sixteenLevelsWindow, assignScreen];
