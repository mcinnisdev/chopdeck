import { describe, it, expect } from 'vitest';
import { tickToBBT, bbtToTick, formatBBT, barStartTick, tickToSeconds, secondsToTick, quantiseTick, sequenceLengthTicks } from './time';
import { PPQ } from './types';

const four = [{ fromBar: 0, num: 4, den: 4 }];

describe('bar.beat.tick', () => {
  it('formats tick 0 as 001.01.00', () => {
    expect(formatBBT(tickToBBT(four, 0))).toBe('001.01.00');
  });
  it('rolls beats and bars at 96 ppq 4/4', () => {
    expect(formatBBT(tickToBBT(four, 96))).toBe('001.02.00');
    expect(formatBBT(tickToBBT(four, 96 * 4))).toBe('002.01.00');
    expect(formatBBT(tickToBBT(four, 96 * 4 + 95))).toBe('002.01.95');
  });
  it('round-trips', () => {
    for (const t of [0, 1, 95, 96, 383, 384, 1000, 5000]) expect(bbtToTick(four, tickToBBT(four, t))).toBe(t);
  });
  it('handles a time signature change mid-sequence', () => {
    const ts = [{ fromBar: 0, num: 4, den: 4 }, { fromBar: 2, num: 3, den: 4 }];
    expect(barStartTick(ts, 2)).toBe(2 * 4 * PPQ);
    expect(barStartTick(ts, 3)).toBe(2 * 4 * PPQ + 3 * PPQ);
    expect(formatBBT(tickToBBT(ts, 2 * 4 * PPQ + 3 * PPQ))).toBe('004.01.00');
    expect(sequenceLengthTicks({ tsigs: ts, bars: 4 })).toBe(8 * PPQ + 6 * PPQ);
  });
  it('handles 6/8', () => {
    const ts = [{ fromBar: 0, num: 6, den: 8 }];
    expect(formatBBT(tickToBBT(ts, 48))).toBe('001.02.00');
    expect(formatBBT(tickToBBT(ts, 48 * 6))).toBe('002.01.00');
  });
});

describe('tempo map', () => {
  it('constant tempo: one beat at 120 = 0.5s', () => {
    expect(tickToSeconds(120, false, [{ tick: 0, ratio: 1 }], 96)).toBeCloseTo(0.5);
    expect(secondsToTick(120, false, [{ tick: 0, ratio: 1 }], 0.5)).toBeCloseTo(96);
  });
  it('integrates a tempo change', () => {
    const ch = [{ tick: 0, ratio: 1 }, { tick: 96, ratio: 2 }];
    // first beat at 120 (0.5s), second beat at 240 (0.25s)
    expect(tickToSeconds(120, true, ch, 192)).toBeCloseTo(0.75);
    expect(secondsToTick(120, true, ch, 0.75)).toBeCloseTo(192);
    expect(secondsToTick(120, true, ch, 0.25)).toBeCloseTo(48);
  });
});

describe('quantise', () => {
  it('snaps to nearest 1/16 grid', () => {
    expect(quantiseTick(10, 24)).toBe(0);
    expect(quantiseTick(13, 24)).toBe(24);
    expect(quantiseTick(47, 24)).toBe(48);
  });
  it('applies swing to odd slots only', () => {
    expect(quantiseTick(24, 24, 60)).toBe(24 + Math.round(0.1 * 48));
    expect(quantiseTick(48, 24, 60)).toBe(48);
  });
  it('OFF grid (1 tick) leaves ticks alone', () => {
    expect(quantiseTick(37, 1)).toBe(37);
  });
});
