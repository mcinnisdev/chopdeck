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

  it('adds sounds, puts them on pads, makes and renames kits', () => {
    const fw = boot();
    const tone = new Float32Array(2000).map((_, i) => Math.sin(i * 0.1) * 0.5);
    const s = fw.addSound('my break.wav', [tone], 44100);
    expect(s.name).toBe('MY BREAK');
    expect(fw.m.sounds[fw.m.sounds.length - 1]).toBe(s);
    expect(fw.s.sound).toBe(fw.m.sounds.length - 1);
    // an empty pad on the starter kit takes it; clearing puts nothing back
    const pg0 = fw.m.drums[0].pgm;
    fw.assignPad(12, s.id);
    const note = fw.m.programs[pg0].padToNote[12];
    expect(fw.m.programs[pg0].notes[note - 35].snd).toBe(s.id);
    fw.assignPad(12, null);
    expect(fw.m.programs[pg0].notes[note - 35].snd).toBeNull();
    // a new kit lands on DRUM1 and can be renamed
    const i = fw.newProgram('MINE');
    expect(i).not.toBe(pg0);
    expect(fw.m.drums[0].pgm).toBe(i);
    expect(fw.m.programs[i].used).toBe(true);
    expect(fw.m.programs[i].name).toBe('MINE');
    fw.renameProgram(i, 'A VERY LONG KIT NAME INDEED');
    expect(fw.m.programs[i].name.length).toBeLessThanOrEqual(16);
  });

  it('chops a sound into equal slices on the pads, like SLICE SOUND', () => {
    const fw = boot();
    const s = fw.addSound('LOOP', [new Float32Array(16000).map((_, i) => Math.sin(i * 0.02))], 16000);
    const before = fw.m.sounds.length;
    const slices = fw.chopToPads(s.id, 8, 'new', 0, 16000);
    expect(slices.length).toBe(8);
    expect(fw.m.sounds.length).toBe(before + 8);
    expect(slices[0].length).toBe(2000);
    const pg = fw.m.programs[fw.m.drums[0].pgm];
    expect(pg.name).toBe('LOOP');
    for (let k = 0; k < 8; k++) expect(pg.notes[pg.padToNote[k] - 35].snd).toBe(slices[k].id);
    expect(pg.notes[pg.padToNote[8] - 35].snd).toBeNull();
    // onto the current kit instead, from pad 1
    const more = fw.chopToPads(s.id, 4, 'current', 4000, 8000);
    expect(more.length).toBe(4);
    expect(more[0].length).toBe(1000);
    expect(pg.notes[pg.padToNote[0] - 35].snd).toBe(more[0].id);
    expect(fw.chopToPads('nope', 4, 'new')).toEqual([]);
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
