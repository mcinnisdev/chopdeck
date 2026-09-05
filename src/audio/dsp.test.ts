import { describe, it, expect } from 'vitest';
import { discard, deleteSection, silence, reverse, insert, normalize, resample, timeStretch, equalZones, sliceZones, regionTempo, bitReduce } from './dsp';
import { newSound } from '@/model/factory';

const ramp = (n: number) => [Float32Array.from({ length: n }, (_, i) => i / n)];
const sine = (n: number, f: number, rate: number) => [Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / rate))];

describe('section ops', () => {
  it('discard keeps [st,end)', () => { expect(Array.from(discard(ramp(10), 2, 5)[0])).toEqual([0.2, 0.3, 0.4].map(v => Math.fround(v))); });
  it('delete closes the gap', () => { expect(deleteSection(ramp(10), 2, 5)[0].length).toBe(7); expect(deleteSection(ramp(10), 2, 5)[0][2]).toBeCloseTo(0.5); });
  it('silence zeroes and reverse flips the range only', () => {
    expect(Array.from(silence(ramp(4), 1, 3)[0])).toEqual([0, 0, 0, 0.75]);
    const r = reverse(ramp(4), 1, 3)[0]; expect(r[1]).toBeCloseTo(0.5); expect(r[2]).toBeCloseTo(0.25); expect(r[3]).toBeCloseTo(0.75);
  });
  it('insert splices another sound in', () => { const out = insert(ramp(4), [new Float32Array([9, 9])], 2)[0]; expect(Array.from(out)).toEqual([0, 0.25, 9, 9, 0.5, 0.75]); });
  it('normalize hits the target peak', () => { const out = normalize([new Float32Array([0.1, -0.5, 0.2])], 1)[0]; expect(Math.max(...Array.from(out).map(Math.abs))).toBeCloseTo(1); });
  it('bit reduce quantises', () => { const out = bitReduce([new Float32Array([0.3])], 2)[0]; expect(out[0]).toBe(0.5); });
});

describe('resample', () => {
  it('halves the length going 44.1k -> 22.05k and keeps a low tone', () => {
    const src = sine(4410, 440, 44100);
    for (const q of ['LOW', 'MED', 'HIGH'] as const) {
      const out = resample(src, 44100, 22050, q)[0];
      expect(out.length).toBe(2205);
      // the tone survives: peak near 1
      expect(Math.max(...Array.from(out.subarray(100, 2100)).map(Math.abs))).toBeGreaterThan(0.9);
    }
  });
});

describe('time stretch', () => {
  it('changes length by the ratio and keeps the signal level', () => {
    const src = sine(22050, 220, 44100);
    const out = timeStretch(src, 44100, 150, 11, 'A')[0];
    expect(out.length).toBe(Math.round(22050 * 1.5));
    const rms = Math.sqrt(out.subarray(2000, 20000).reduce((a, v) => a + v * v, 0) / 18000);
    expect(rms).toBeGreaterThan(0.5); expect(rms).toBeLessThan(0.85);
    const half = timeStretch(src, 44100, 50, 7, 'C')[0];
    expect(half.length).toBe(11025);
  });
});

describe('zones', () => {
  it('divides evenly and slices with an end margin', () => {
    expect(equalZones(0, 1000, 4)).toEqual([{ st: 0, end: 250 }, { st: 250, end: 500 }, { st: 500, end: 750 }, { st: 750, end: 1000 }]);
    const s = newSound('BREAK', ramp(1000), 44100); s.zones = equalZones(0, 1000, 4);
    const slices = sliceZones(s, 20);
    expect(slices.map(x => x.name)).toEqual(['BREAK1', 'BREAK2', 'BREAK3', 'BREAK4']);
    expect(slices[0].length).toBe(270); expect(slices[3].length).toBe(250);
  });
  it('computes beat-loop tempo', () => { expect(regionTempo(44100, 0, 88200, 4)).toBe(120); });
});
