import { describe, it, expect } from 'vitest';
import { newSound } from '@/model/factory';
import { peaksOf, durationMs } from './sample';

describe('samples', () => {
  it('summarises a sound as peaks and a duration', () => {
    const a = new Float32Array(44100);
    for (let i = 0; i < a.length; i++) a[i] = i < 22050 ? 0.25 : 0.9 * Math.sin(i);
    const s = newSound('REC', [a], 44100);
    const p = peaksOf(s.pcm, 10);
    expect(p.length).toBe(10);
    expect(p.slice(0, 5).every(v => v === 0.25)).toBe(true);
    expect(p.slice(5).every(v => v > 0.8 && v <= 1)).toBe(true);
    expect(durationMs(s)).toBe(1000);
    expect(peaksOf([new Float32Array(0)])).toEqual([]);
    // stereo peaks take the louder channel
    const b = new Float32Array(44100).fill(0.5);
    expect(peaksOf([a, b], 4)[0]).toBe(0.5);
  });
});
