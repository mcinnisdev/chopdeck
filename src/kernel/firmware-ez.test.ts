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

  it('keeps chops as zones, finds hits, and puts one chop on one pad', () => {
    const fw = boot();
    const a = new Float32Array(16000);
    for (const h of [0, 4000, 8000, 12000]) for (let i = 0; i < 800; i++) a[h + i] = Math.sin(i * 0.4) * Math.exp(-i / 200);
    const s = fw.addSound('HITS', [a], 16000);
    expect(fw.zoneStarts(s.id)).toEqual([0, .125, .25, .375, .5, .625, .75, .875]);
    fw.setZoneStarts(s.id, [0.5, 0, 0.25, 0.25, 1.2]);
    expect(s.zones.map(z => [z.st, z.end])).toEqual([[0, 4000], [4000, 8000], [8000, 16000]]);
    expect(fw.zoneStarts(s.id)).toEqual([0, .25, .5]);
    fw.chopOnsets(s.id, 16);
    expect(s.zones.length).toBe(4);
    expect(s.zones.map(z => Math.round(z.st / 1000))).toEqual([0, 4, 8, 12]);
    const sl = fw.assignChopToPad(s.id, 2, 13)!;
    expect(sl.name).toBe('HITS3');
    expect(sl.length).toBe(4000);
    const pg = fw.m.programs[fw.m.drums[0].pgm];
    expect(pg.notes[pg.padToNote[13] - 35].snd).toBe(sl.id);
    // all zones onto the current kit, as they are
    const all = fw.chopToPads(s.id, null, 'current');
    expect(all.length).toBe(4);
    expect(pg.notes[pg.padToNote[0] - 35].snd).toBe(all[0].id);
  });

  it('shows and edits the current track on a 1/16 grid, undoably', () => {
    const fw = boot();
    fw.m.sequences[0].bars = 1;
    let g = fw.stepGrid();
    expect(g.steps).toBe(16);
    expect(g.rows.length).toBe(16);
    expect(g.rows.every(r => r.every(c => !c))).toBe(true);
    fw.toggleStep(0, 0); fw.toggleStep(0, 8); fw.toggleStep(1, 4);
    g = fw.stepGrid();
    expect(g.rows[0][0] && g.rows[0][8] && g.rows[1][4]).toBe(true);
    expect(fw.m.sequences[0].tracks[fw.s.track].events.length).toBe(3);
    fw.toggleStep(0, 8);
    expect(fw.stepGrid().rows[0][8]).toBe(false);
    expect(fw.s.undoAvailable).toBe(true);
    fw.undo();
    expect(fw.stepGrid().rows[0][8]).toBe(true);
    fw.setBars(2);
    expect(fw.stepGrid().steps).toBe(32);
    fw.setLoop(false); expect(fw.m.sequences[0].loop.on).toBe(false);
    fw.clearTrack();
    expect(fw.m.sequences[0].tracks[fw.s.track].events.length).toBe(0);
  });

  it('reads and sets a pad level and the bank', () => {
    const fw = boot();
    expect(fw.padLevel(0)).toBe(100);
    fw.setPadLevel(0, 63.4); expect(fw.padLevel(0)).toBe(63);
    fw.setPadLevel(0, 500); expect(fw.padLevel(0)).toBe(100);
    fw.setPadBank(2); expect(fw.s.padBank).toBe(2);
    fw.setPadBank(9); expect(fw.s.padBank).toBe(3);
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
