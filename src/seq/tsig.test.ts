import { describe, it, expect } from 'vitest';
import { changeTsig, normaliseTsigs } from './tsig';
import { noteEvent } from './events';
import { newSequence } from '@/model/factory';
import { PPQ } from '@/model/types';

const BAR = PPQ * 4;   // 4/4
const BAR3 = PPQ * 3;  // 3/4
const ticks = (s: ReturnType<typeof newSequence>) => s.tracks[0].events.map(e => e.tick);

describe('normaliseTsigs', () => {
  it('sorts, merges equal neighbours and anchors at bar 0', () => {
    expect(normaliseTsigs([{ fromBar: 2, num: 3, den: 4 }, { fromBar: 0, num: 4, den: 4 }, { fromBar: 1, num: 4, den: 4 }, { fromBar: 3, num: 3, den: 4 }]))
      .toEqual([{ fromBar: 0, num: 4, den: 4 }, { fromBar: 2, num: 3, den: 4 }]);
    expect(normaliseTsigs([{ fromBar: 1, num: 7, den: 8 }])).toEqual([{ fromBar: 0, num: 7, den: 8 }]);
    expect(normaliseTsigs([])).toEqual([{ fromBar: 0, num: 4, den: 4 }]);
  });
});

describe('changeTsig', () => {
  it('4/4 -> 3/4 on both bars of a 2-bar sequence shifts bar 2 and drops beat-4 notes', () => {
    const s = newSequence(0); s.bars = 2;
    s.tracks[0].events = [noteEvent(0, 36, 100, 10), noteEvent(3 * PPQ, 38, 100, 10), noteEvent(BAR, 36, 100, 10), noteEvent(BAR + PPQ, 40, 100, 10), noteEvent(BAR + 3 * PPQ, 42, 100, 10)];
    changeTsig(s, 1, 2, 3, 4);
    expect(s.tsigs).toEqual([{ fromBar: 0, num: 3, den: 4 }]);
    expect(ticks(s)).toEqual([0, BAR3, BAR3 + PPQ]);
    expect(s.bars).toBe(2);
  });
  it('changes only the middle bar and keeps later bars in their old signature', () => {
    const s = newSequence(0); s.bars = 3;
    s.tracks[0].events = [noteEvent(BAR + 24, 36, 100, 10), noteEvent(2 * BAR + 48, 36, 100, 10)];
    changeTsig(s, 2, 2, 3, 4);
    expect(s.tsigs).toEqual([{ fromBar: 0, num: 4, den: 4 }, { fromBar: 1, num: 3, den: 4 }, { fromBar: 2, num: 4, den: 4 }]);
    expect(ticks(s)).toEqual([BAR + 24, BAR + BAR3 + 48]);
    // and back again merges into a single entry with the original positions
    changeTsig(s, 2, 2, 4, 4);
    expect(s.tsigs).toEqual([{ fromBar: 0, num: 4, den: 4 }]);
    expect(ticks(s)).toEqual([BAR + 24, 2 * BAR + 48]);
  });
  it('adds space when the bar grows and keeps offsets', () => {
    const s = newSequence(0); s.bars = 2;
    s.tracks[0].events = [noteEvent(BAR + 96, 36, 100, 10)];
    changeTsig(s, 1, 1, 5, 4);
    expect(s.tsigs).toEqual([{ fromBar: 0, num: 5, den: 4 }, { fromBar: 1, num: 4, den: 4 }]);
    expect(ticks(s)).toEqual([5 * PPQ + 96]);
  });
  it('changes the denominator by ticks (4/4 -> 4/8 halves the bar)', () => {
    const s = newSequence(0); s.bars = 1;
    s.tracks[0].events = [noteEvent(96, 36, 100, 10), noteEvent(288, 36, 100, 10)];
    changeTsig(s, 1, 1, 4, 8);
    expect(s.tsigs).toEqual([{ fromBar: 0, num: 4, den: 8 }]);
    expect(ticks(s)).toEqual([96]);
  });
});
