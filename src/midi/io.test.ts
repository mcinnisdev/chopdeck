import { describe, it, expect } from 'vitest';
import { parseMidi, ClockFollower } from './io';

describe('parseMidi', () => {
  it('decodes channel messages', () => {
    expect(parseMidi([0x92, 60, 100])).toEqual({ kind: 'noteOn', ch: 2, note: 60, vel: 100 });
    expect(parseMidi([0x92, 60, 0])).toEqual({ kind: 'noteOff', ch: 2, note: 60 });
    expect(parseMidi([0xb0, 7, 90])).toEqual({ kind: 'cc', ch: 0, cc: 7, value: 90 });
    expect(parseMidi([0xc5, 9])).toEqual({ kind: 'pgm', ch: 5, value: 10 });
    expect(parseMidi([0xe0, 0, 64])).toEqual({ kind: 'bend', ch: 0, value: 0 });
    expect(parseMidi([0xf8])).toEqual({ kind: 'clock' });
  });
});
describe('ClockFollower', () => {
  it('derives 120 bpm from 24 pulses per 500 ms', () => {
    const f = new ClockFollower();
    for (let i = 0; i < 48; i++) f.pulse(i * (500 / 24));
    expect(f.bpm).toBeCloseTo(120, 0);
  });
});
