import { describe, it, expect } from 'vitest';
import { Firmware } from './firmware';
import { newMachineWithStarterProgram, newMachine } from '@/model/factory';
import { installStarterKit } from '@/audio/starterKit';
import { allScreens } from '@/screens';

// The plain operations the EZ panel drives; OG's screens use the same ones.
describe('kernel methods for the EZ panel', () => {
  const boot = () => { const m = newMachineWithStarterProgram(); installStarterKit(m); return new Firmware(m, allScreens); };

  it('reads and sets the tempo where the sequence takes it from', () => {
    const fw = boot();
    fw.m.sequences[0].tempoSource = 'SEQ'; fw.m.sequences[0].tempo = 93;
    expect(fw.tempo()).toBe(93);
    fw.setTempo(100.06);
    expect(fw.m.sequences[0].tempo).toBe(100.1);
    fw.setTempo(5); expect(fw.tempo()).toBe(30);
    fw.setTempo(999); expect(fw.tempo()).toBe(300);
    fw.m.sequences[0].tempoSource = 'MAS';
    fw.setTempo(120);
    expect(fw.s.masterTempo).toBe(120);
    expect(fw.m.sequences[0].tempo).toBe(300);
  });

  it('sets swing within the machine\'s range', () => {
    const fw = boot();
    fw.setSwing(62.4); expect(fw.m.swing).toBe(62);
    fw.setSwing(10); expect(fw.m.swing).toBe(50);
    fw.setSwing(90); expect(fw.m.swing).toBe(75);
  });

  it('chooses a sequence now, or next when playing', () => {
    const fw = boot();
    fw.setSequence(3); expect(fw.s.seq).toBe(3);
    fw.setSequence(-1); expect(fw.s.seq).toBe(0);
    fw.setSequence(500); expect(fw.s.seq).toBe(98);
    fw.s.playing = true;
    fw.setSequence(5); expect(fw.s.seq).toBe(98); expect(fw.s.nextSeq).toBe(5);
  });

  it('puts a program on a drum and marks it used', () => {
    const fw = boot();
    fw.setProgram(0, 3);
    expect(fw.m.drums[0].pgm).toBe(3);
    expect(fw.m.programs[3].used).toBe(true);
    fw.setProgram(0, 99); expect(fw.m.drums[0].pgm).toBe(23);
  });

  it('loads a whole project and rewinds', () => {
    const fw = boot();
    fw.s.seq = 4; fw.s.now = 384; fw.s.sound = 2;
    const other = newMachine(); other.sequences[0].name = 'Loaded';
    fw.loadProject({ machine: other, masterTempo: 88 });
    expect(fw.m.sequences[0].name).toBe('Loaded');
    expect(fw.s.masterTempo).toBe(88);
    expect(fw.s.seq).toBe(0); expect(fw.s.now).toBe(0); expect(fw.s.sound).toBe(0);
  });
});
