import { describe, it, expect } from 'vitest';
import { eraseEvents, noteEvent } from './events';
import { newTrack } from '@/model/factory';
import { SeqEvent } from '@/model/types';

const mixed = (): SeqEvent[] => [
  noteEvent(0, 36, 100, 10),
  { kind: 'cc', tick: 10, cc: 1, value: 64 },
  noteEvent(24, 38, 100, 10),
  { kind: 'bend', tick: 30, value: 100 },
  noteEvent(96, 36, 100, 10),
];
const kinds = (t: ReturnType<typeof newTrack>) => t.events.map(e => (e.kind === 'note' ? `n${e.note}` : e.kind));

describe('eraseEvents', () => {
  it('ALL EVENTS erases everything inside the range only', () => {
    const t = newTrack(0); t.events = mixed();
    expect(eraseEvents(t, { from: 0, to: 48 })).toBe(4);
    expect(kinds(t)).toEqual(['n36']);
  });
  it('ALL EVENTS limited to a note range erases just those notes and keeps other kinds', () => {
    const t = newTrack(0); t.events = mixed();
    expect(eraseEvents(t, { from: 0, to: 48, mode: 'ALL', notes: { lo: 36, hi: 36 } })).toBe(1);
    expect(kinds(t)).toEqual(['cc', 'n38', 'bend', 'n36']);
  });
  it('ONLY ERASE a kind, with and without a note range', () => {
    const t = newTrack(0); t.events = mixed();
    expect(eraseEvents(t, { from: 0, to: 200, mode: 'ONLY', kind: 'cc' })).toBe(1);
    expect(kinds(t)).toEqual(['n36', 'n38', 'bend', 'n36']);
    expect(eraseEvents(t, { from: 0, to: 200, mode: 'ONLY', kind: 'note', notes: { lo: 38, hi: 38 } })).toBe(1);
    expect(kinds(t)).toEqual(['n36', 'bend', 'n36']);
  });
  it('ALL EXCEPT a kind keeps that kind and erases the rest of the range', () => {
    const t = newTrack(0); t.events = mixed();
    expect(eraseEvents(t, { from: 0, to: 48, mode: 'EXCEPT', kind: 'note' })).toBe(2);
    expect(kinds(t)).toEqual(['n36', 'n38', 'n36']);
  });
});
