import { describe, it, expect } from 'vitest';
import { detectOnsets } from './dsp';

describe('detectOnsets', () => {
  it('finds the hits in a decaying-click pattern and keeps them in time order', () => {
    const rate = 22050; const n = rate * 2;
    const a = new Float32Array(n);
    const hits = [0, 0.5, 1.0, 1.25, 1.5].map(t => Math.round(t * rate));
    for (const h of hits) for (let i = 0; i < 4000 && h + i < n; i++) a[h + i] += Math.sin(i * 0.3) * Math.exp(-i / 900) * 0.8;
    const found = detectOnsets([a], rate, 16);
    expect(found[0]).toBe(0);
    for (const h of hits.slice(1)) expect(found.some(f => Math.abs(f - h) < rate * 0.03)).toBe(true);
    expect(found.length).toBeLessThanOrEqual(8);
    // max caps the count, strongest first, still sorted
    const four = detectOnsets([a], rate, 4);
    expect(four.length).toBe(4);
    expect([...four].sort((x, y) => x - y)).toEqual(four);
    expect(detectOnsets([new Float32Array(0)], rate)).toEqual([0]);
    expect(detectOnsets([new Float32Array(rate)], rate)).toEqual([0]);
  });
});
