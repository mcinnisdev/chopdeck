import { describe, it, expect } from 'vitest';
import { newMachineWithStarterProgram } from '@/model/factory';
import { installStarterKit } from '@/audio/starterKit';
import { buildKit, kitToPgm, kitPadSound, padNames, programSounds } from './kit';
import { decodePgm } from './formats';

describe('kits', () => {
  it('packs a program and its sounds into a manifest with hashes, and back into a .PGM the machine loads', async () => {
    const m = newMachineWithStarterProgram();
    installStarterKit(m);
    const program = m.programs[0];
    const used = programSounds(m, program);
    expect(used.length).toBeGreaterThan(0);
    const { manifest, blobs, pads } = await buildKit(m, program);
    expect(manifest.kind).toBe('CHOPDECK-KIT');
    expect(manifest.program.padAssign).toBe('PROGRAM');
    expect(Object.keys(manifest.blobs).length).toBe(used.length);
    expect(blobs.size).toBe(new Set(Object.values(manifest.blobs)).size);
    expect(pads.length).toBe(16);
    expect(pads.filter(Boolean).length).toBeGreaterThan(0);
    expect(pads).toEqual(padNames(m, program));
    expect(kitPadSound(manifest, 0)).toBe(program.notes[program.padToNote[0] - 35]?.snd ?? null);

    const pgm = decodePgm(kitToPgm(manifest, blobs));
    expect(pgm).not.toBeNull();
    expect(pgm!.missing).toEqual([]);
    expect(pgm!.program.name).toBe(program.name);
    expect(pgm!.sounds.map(s => s.name).sort()).toEqual(used.map(s => s.name).sort());
    expect(pgm!.sounds[0].length).toBeGreaterThan(0);
  });
});
