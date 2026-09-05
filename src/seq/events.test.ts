import { describe, it, expect } from 'vitest';
import { insertEvent, eventsInRange, eraseEvents, timingCorrect, copyEvents, insertBars, deleteBars, copyBars, noteEvent, editVelocity } from './events';
import { newSequence, newTrack } from '@/model/factory';
import { PPQ } from '@/model/types';

const BAR = PPQ * 4;

describe('event lists', () => {
  it('inserts keeping tick order and stable for equal ticks', () => {
    const ev = [noteEvent(0, 36, 100, 10), noteEvent(48, 38, 100, 10)];
    insertEvent(ev, noteEvent(24, 42, 90, 10));
    insertEvent(ev, noteEvent(24, 43, 90, 10));
    expect(ev.map(e => [e.tick, (e as { note: number }).note])).toEqual([[0, 36], [24, 42], [24, 43], [48, 38]]);
    expect(eventsInRange(ev, 24, 48).length).toBe(2);
  });
  it('erases all events in a range, or only one pad', () => {
    const t = newTrack(0); t.events = [noteEvent(0, 36, 100, 10), noteEvent(24, 38, 100, 10), noteEvent(96, 36, 100, 10)];
    expect(eraseEvents(t, { from: 0, to: 48, notes: { lo: 38, hi: 38 } })).toBe(1);
    expect(eraseEvents(t, { from: 0, to: 48 })).toBe(1);
    expect(t.events.length).toBe(1);
  });
  it('timing correct snaps notes with swing and shift', () => {
    const t = newTrack(0); t.events = [noteEvent(10, 36, 100, 10), noteEvent(30, 38, 100, 10)];
    timingCorrect(t, { value: '1/16', swing: 50, shift: 0, from: 0, to: BAR });
    expect(t.events.map(e => e.tick)).toEqual([0, 24]);
    timingCorrect(t, { value: '1/16', swing: 62, shift: 0, from: 0, to: BAR });
    expect(t.events.map(e => e.tick)).toEqual([0, 24 + Math.round(0.12 * 48)]);
  });
  it('edits velocity by type', () => {
    const t = newTrack(0); t.events = [noteEvent(0, 36, 100, 10)];
    editVelocity(t, { type: 'MULT VAL%', value: 50 }, 0, BAR);
    expect((t.events[0] as { vel: number }).vel).toBe(50);
    editVelocity(t, { type: 'ADD VALUE', value: 200 }, 0, BAR);
    expect((t.events[0] as { vel: number }).vel).toBe(127);
  });
  it('copies events with replace and multiple copies', () => {
    const a = newTrack(0); a.events = [noteEvent(0, 36, 100, 10), noteEvent(48, 38, 100, 10)];
    const b = newTrack(1); b.events = [noteEvent(BAR + 10, 40, 100, 10)];
    copyEvents(a, b, { from: 0, to: 96, start: BAR, copies: 2, mode: 'REPLACE' });
    expect(b.events.map(e => e.tick)).toEqual([BAR, BAR + 48, BAR + 96, BAR + 144]);
  });
});

describe('bars', () => {
  it('inserts and deletes bars shifting events', () => {
    const s = newSequence(0); s.bars = 2;
    s.tracks[0].events = [noteEvent(0, 36, 100, 10), noteEvent(BAR, 36, 100, 10)];
    insertBars(s, 1, 2, BAR);
    expect(s.bars).toBe(4);
    expect(s.tracks[0].events.map(e => e.tick)).toEqual([0, 3 * BAR]);
    deleteBars(s, 2, 3, BAR);
    expect(s.bars).toBe(2);
    expect(s.tracks[0].events.map(e => e.tick)).toEqual([0, BAR]);
  });
  it('copies bars across sequences, inserting', () => {
    const a = newSequence(0); a.bars = 1; a.tracks[0].events = [noteEvent(24, 36, 100, 10)];
    const b = newSequence(1); b.bars = 1; b.tracks[0].events = [noteEvent(0, 40, 100, 10)];
    copyBars(a, b, 1, 1, 1, 2, BAR);
    expect(b.bars).toBe(3);
    expect(b.tracks[0].events.map(e => e.tick)).toEqual([0, BAR + 24, 2 * BAR + 24]);
    expect(b.used).toBe(true);
  });
});
