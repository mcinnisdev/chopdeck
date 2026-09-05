// MIDI/SYNC mode: SYNC (clock in/out), PORTS (bind Web MIDI devices, monitors), MIDIsw (footswitch functions).
import { ScreenDef, Ctx } from '@/kernel/screen';
import { text, ATTR_DIM, ATTR_INVERSE } from '@/lcd/frame';
import { enumField, boolField, intField, clamp } from './util';
import { FOOTSWITCH_FNS } from '@/midi/io';

export interface MidiPortsApi { available: boolean; inputs(): string[]; outputs(): string[]; bind(b: { inPort: string; outA: string; outB: string }): void; monitor(w: 'in' | 'outA' | 'outB'): Set<number>; lastInputSummary(): string; panic(): void; init(): Promise<boolean> }
let ports: MidiPortsApi | null = null;
export function installMidiPorts(p: MidiPortsApi) { ports = p; }

const footer = (page: string): ((c: Ctx) => (import('@/kernel/screen').SoftKeyDef | null)[]) => () => [
  { label: 'SYNC', kind: page === 'SYNC' ? 'current' : 'page', press: c => c.fw.setPage('SYNC') },
  { label: 'PORTS', kind: page === 'PORTS' ? 'current' : 'page', press: c => c.fw.setPage('PORTS') },
  { label: 'MIDIsw', kind: page === 'MIDISW' ? 'current' : 'page', press: c => c.fw.setPage('MIDISW') },
  null, null,
  page === 'PORTS' ? { label: 'PANIC', kind: 'action', press: c => { ports?.panic(); c.fw.sound.stopAll(); } } : null,
];

export const syncPage: ScreenDef = {
  id: 'MIDI/SYNC',
  fields: () => [
    enumField({ id: 'inMode', row: 1, col: 5, width: 10, label: 'Mode:', values: ['OFF', 'MIDI CLOCK'] as const, get: c => c.m.midi.syncIn.mode === 'MIDI TIME CODE' ? 'OFF' : c.m.midi.syncIn.mode, set: (c, v) => { c.m.midi.syncIn.mode = v; } }),
    intField({ id: 'shift', row: 2, col: 17, width: 3, label: 'Shift early(ms):', min: 0, max: 100, get: c => c.m.midi.syncIn.shiftEarlyMs, set: (c, v) => { c.m.midi.syncIn.shiftEarlyMs = v; }, hidden: c => c.m.midi.syncIn.mode === 'OFF' }),
    boolField({ id: 'rxMmc', row: 3, col: 12, width: 3, label: 'Receive MMC:', get: c => c.m.midi.syncIn.receiveMmc, set: (c, v) => { c.m.midi.syncIn.receiveMmc = v; } }),
    enumField({ id: 'outMode', row: 1, col: 31, width: 10, label: 'Mode:', values: ['OFF', 'MIDI CLOCK'] as const, get: c => c.m.midi.syncOut.mode === 'MIDI TIME CODE' ? 'OFF' : c.m.midi.syncOut.mode, set: (c, v) => { c.m.midi.syncOut.mode = v; } }),
    boolField({ id: 'txMmc', row: 3, col: 35, width: 3, label: 'Send MMC:', get: c => c.m.midi.syncOut.sendMmc, set: (c, v) => { c.m.midi.syncOut.sendMmc = v; } }),
  ],
  draw(c, f) {
    text(f, 0, 0, `Sync In (In:${(c.m.midi.inPort || 'first').slice(0, 10)})`); text(f, 0, 26, 'Sync Out (Out:A)');
    text(f, 5, 0, c.m.midi.syncIn.mode === 'MIDI CLOCK' ? `Following external clock: ♩ ${c.s.masterTempo.toFixed(1)}` : 'MIDI CLOCK in follows tempo, start and stop.', ATTR_DIM);
    text(f, 6, 0, ports?.available ? 'Web MIDI ready.' : 'NO MIDI PORTS (this browser has no Web MIDI).', ATTR_DIM);
  },
  softKeys: footer('SYNC'),
};

const pick = (c: Ctx, list: string[], cur: string, d: number): string => { const all = ['', ...list]; const i = Math.max(0, all.indexOf(cur)); const next = all[clamp(i + d, 0, all.length - 1)]; void c; return next; };
export const portsPage: ScreenDef = {
  id: 'MIDI/PORTS',
  fields: () => [
    { id: 'in', row: 1, col: 8, width: 24, label: 'Input :', get: c => c.m.midi.inPort || (ports?.inputs()[0] ? `(${ports.inputs()[0]})` : 'NONE'), wheel: (c, d) => { c.m.midi.inPort = pick(c, ports?.inputs() ?? [], c.m.midi.inPort, d); ports?.bind(c.m.midi); } },
    { id: 'outA', row: 2, col: 8, width: 24, label: 'Out A :', get: c => c.m.midi.outA || (ports?.outputs()[0] ? `(${ports.outputs()[0]})` : 'NONE'), wheel: (c, d) => { c.m.midi.outA = pick(c, ports?.outputs() ?? [], c.m.midi.outA, d); ports?.bind(c.m.midi); } },
    { id: 'outB', row: 3, col: 8, width: 24, label: 'Out B :', get: c => c.m.midi.outB || 'NONE', wheel: (c, d) => { c.m.midi.outB = pick(c, ports?.outputs() ?? [], c.m.midi.outB, d); ports?.bind(c.m.midi); } },
  ],
  draw(c, f) {
    text(f, 0, 0, 'MIDI ports'); text(f, 0, 12, ports?.available ? `${ports.inputs().length} in / ${ports.outputs().length} out` : 'Web MIDI not available', ATTR_DIM);
    const mon = (row: number, label: string, set: Set<number>) => { text(f, row, 34, label, ATTR_DIM); for (let ch = 0; ch < 16; ch++) text(f, row, 38 + (ch % 8) + (ch >= 8 ? 0 : 0), '', 0); };
    mon(1, 'IN ', ports?.monitor('in') ?? new Set()); mon(2, 'A  ', ports?.monitor('outA') ?? new Set()); mon(3, 'B  ', ports?.monitor('outB') ?? new Set());
    // channel activity as a 16-cell strip
    const strip = (row: number, set: Set<number>) => { for (let ch = 0; ch < 16; ch++) text(f, row, 33 + ch, set.has(ch) ? '▮' : '·', set.has(ch) ? ATTR_INVERSE : ATTR_DIM); };
    strip(1, ports?.monitor('in') ?? new Set()); strip(2, ports?.monitor('outA') ?? new Set()); strip(3, ports?.monitor('outB') ?? new Set());
    text(f, 5, 0, `Last in: ${ports?.lastInputSummary() || '--'}`.slice(0, 48), ATTR_DIM);
    text(f, 6, 0, 'Turn DATA to pick a device. PANIC = all notes off.', ATTR_DIM);
    void c;
  },
  softKeys: footer('PORTS'),
  onEnter() { void ports?.init(); },
};

export const midiSwPage: ScreenDef = {
  id: 'MIDI/MIDISW',
  fields: () => [0, 1, 2, 3].flatMap(i => [
    intField({ id: `cc${i}`, row: 1 + i, col: 14, width: 3, label: `Switch${i + 1} Ctrl:`, min: 0, max: 127, get: c => c.m.midi.footswitches[i]?.cc ?? 0, set: (c, v) => { c.m.midi.footswitches[i].cc = v; } }),
    enumField({ id: `fn${i}`, row: 1 + i, col: 28, width: 10, label: 'Function:', values: FOOTSWITCH_FNS, get: c => (c.m.midi.footswitches[i]?.fn ?? 'PLAY') as typeof FOOTSWITCH_FNS[number], set: (c, v) => { c.m.midi.footswitches[i].fn = v; } }),
  ]),
  draw(c, f) { text(f, 0, 0, 'MIDI footswitches (controller value >= 64 = press)'); text(f, 6, 0, 'These controllers are not recorded.', ATTR_DIM); void c; },
  softKeys: footer('MIDISW'),
};

export const midiEntry: ScreenDef = { id: 'MIDI', fields: () => [], draw() {}, softKeys: footer('SYNC'), onEnter(c) { if (!c.s.page.MIDI) c.fw.setPage('SYNC'); } };
export const midiScreens: ScreenDef[] = [midiEntry, syncPage, portsPage, midiSwPage];
