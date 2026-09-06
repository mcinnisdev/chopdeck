import { describe, it, expect } from 'vitest';
import { newMachine } from '@/model/factory';
import { encodeMp3, sourceBpm } from './beat';

describe('beats', () => {
  it('encodes stereo audio as an MP3 stream', () => {
    const n = 44100;
    const l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) { l[i] = Math.sin(i * 0.05) * 0.5; r[i] = Math.sin(i * 0.07) * 0.5; }
    const mp3 = encodeMp3([l, r], 44100, 128);
    expect(mp3.byteLength).toBeGreaterThan(10_000);      // a second at 128 kbps is about 16 KB
    expect(mp3.byteLength).toBeLessThan(40_000);
    // MPEG frame sync: 11 set bits at the start of a frame
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    const mono = encodeMp3([l], 44100, 64);
    expect(mono.byteLength).toBeGreaterThan(5_000);
  });

  it('reports the tempo a source plays at', () => {
    const m = newMachine();
    m.sequences[0].tempo = 93; m.sequences[0].tempoSource = 'SEQ';
    m.sequences[1].tempoSource = 'MAS';
    expect(sourceBpm(m, { kind: 'sequence', index: 0 }, 120)).toBe(93);
    expect(sourceBpm(m, { kind: 'sequence', index: 1 }, 120)).toBe(120);
    m.songs[0].steps = [{ seq: 0, reps: 2 }] as typeof m.songs[0]['steps'];
    m.songs[0].tempoSource = 'SEQ';
    expect(sourceBpm(m, { kind: 'song', index: 0 }, 120)).toBe(93);
    m.songs[0].tempoSource = 'MAS'; m.songs[0].tempo = 140;
    expect(sourceBpm(m, { kind: 'song', index: 0 }, 120)).toBe(140);
  });
});
