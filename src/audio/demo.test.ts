import { describe, it, expect } from 'vitest';
import { installDemo } from './demo';
import { newMachineWithStarterProgram } from '@/model/factory';
import { Firmware } from '@/kernel/firmware';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';

describe('factory demo', () => {
  it('installs sounds, a chopped program, two sequences and a song, once', () => {
    const m = newMachineWithStarterProgram();
    installDemo(m); installDemo(m);
    expect(m.sounds.filter(s => s.name === 'BREAK 93')).toHaveLength(1);
    expect(m.sounds.filter(s => /^BREAK 93\d$/.test(s.name))).toHaveLength(8);
    expect(m.programs[1].name).toBe('BREAK CHOPS');
    expect(m.sequences[0]).toMatchObject({ used: true, name: 'First Beat', bars: 2 });
    expect(m.sequences[0].tracks[0].events.length).toBeGreaterThan(20);
    expect(m.sequences[1].tracks[0].type).toBe('DRUM2');
    expect(m.songs[0].steps.length).toBe(3);
    const brk = m.sounds.find(s => s.name === 'BREAK 93')!;
    let peak = 0; for (const v of brk.pcm[0]) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.8);
  });
  it('boots to the demo sequence on the main screen', () => {
    const m = newMachineWithStarterProgram(); installDemo(m);
    const fw = new Firmware(m, allScreens);
    const l = frameToLines(fw.render());
    expect(l[0]).toContain('Sq:01-First Beat');
    expect(l[1]).toContain('♩: 93.0(SEQ)');
    expect(l[2]).toContain('Loop:ON');
  });
});

describe('fieldAt', () => {
  it('finds the field under an LCD cell, label included', () => {
    const fw = new Firmware(newMachineWithStarterProgram(), allScreens);
    expect(fw.fieldAt(0, 1)?.field.id).toBe('seq');      // on the "Sq:" label
    expect(fw.fieldAt(0, 4)?.field.id).toBe('seq');
    expect(fw.fieldAt(1, 22)?.field.id).toBe('timing');
    expect(fw.fieldAt(5, 10)).toBeNull();
  });
});
