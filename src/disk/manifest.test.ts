import { describe, it, expect } from 'vitest';
import { newMachine, newSound } from '@/model/factory';
import { buildManifest, machineFromManifest, sha256, soundBlob, projectTitle } from './manifest';

const tone = (n: number, f: number) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.sin(i * f) * 0.5; return a; };

describe('project manifest', () => {
  it('replaces sounds by hash and comes back with the same machine', async () => {
    const m = newMachine();
    m.sounds.push(newSound('KICK', [tone(4000, 0.05)], 44100));
    m.sounds.push(newSound('SNARE', [tone(3000, 0.3), tone(3000, 0.31)], 44100));
    m.sounds[1].st = 100; m.sounds[1].end = 2500; m.sounds[1].tune = -12;
    m.sequences[0].name = 'Demo Beat';
    const { manifest, blobs } = await buildManifest(m, 93);
    expect(manifest.kind).toBe('CHOPDECK-MANIFEST');
    expect(manifest.title).toBe('Demo Beat');
    expect(manifest.masterTempo).toBe(93);
    expect(Object.keys(manifest.blobs)).toEqual(m.sounds.map(s => s.id));
    expect(blobs.size).toBe(2);
    for (const h of Object.values(manifest.blobs)) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(manifest)).not.toContain('pcm');

    // the manifest survives a JSON round trip (as it does through the API)
    const back = machineFromManifest(JSON.parse(JSON.stringify(manifest)), blobs);
    expect(back.missing).toEqual([]);
    expect(back.masterTempo).toBe(93);
    expect(back.machine.sounds.map(s => s.name)).toEqual(['KICK', 'SNARE']);
    expect(back.machine.sounds[1].channels).toBe(2);
    expect(back.machine.sounds[1].st).toBe(100);
    expect(back.machine.sounds[1].tune).toBe(-12);
    expect(back.machine.sounds[0].length).toBe(4000);
    expect(back.machine.sounds[0].pcm[0][10]).toBeCloseTo(m.sounds[0].pcm[0][10], 3);
    expect(back.machine.sequences[0].name).toBe('Demo Beat');
  });

  it('hashes are stable, change with metadata, and are cached per buffer', async () => {
    const s = newSound('HAT', [tone(500, 0.9)], 44100);
    const a = await soundBlob(s);
    const b = await soundBlob(s);
    expect(a.hash).toBe(b.hash);
    expect(a.bytes).toBe(b.bytes); // same object: served from the cache
    s.level = 50;
    const c = await soundBlob(s);
    expect(c.hash).not.toBe(a.hash);
    expect(await sha256(new Uint8Array([1, 2, 3]))).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  });

  it('reports sounds whose blob is missing and keeps the rest', async () => {
    const m = newMachine();
    m.sounds.push(newSound('A', [tone(100, 0.1)], 44100), newSound('B', [tone(100, 0.2)], 44100));
    const { manifest, blobs } = await buildManifest(m, 120);
    blobs.delete(manifest.blobs[m.sounds[1].id]);
    const back = machineFromManifest(manifest, blobs);
    expect(back.missing).toEqual([m.sounds[1].id]);
    expect(back.machine.sounds[0].length).toBe(100);
    expect(back.machine.sounds[1].length).toBe(0);
    expect(projectTitle(m)).toBe(m.sequences[0].name);
  });
});
