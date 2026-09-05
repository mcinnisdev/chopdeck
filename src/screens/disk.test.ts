import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSound } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { noteEvent } from '@/seq/events';
import { MemoryDrive } from '@/disk/drive';
import { installDrive, diskState, refresh } from './disk';
import { NOTE_MIN } from '@/model/types';

const tick = () => new Promise(r => setTimeout(r, 0));
const boot = async () => {
  const m = newMachineWithStarterProgram();
  const snd = newSound('KICK', [Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 3))], 44100); m.sounds.push(snd); m.programs[0].notes[0].snd = snd.id;
  m.sequences[0].used = true; m.sequences[0].bars = 1; m.sequences[0].name = 'Beat'; m.sequences[0].tracks[0].events = [noteEvent(0, 35, 100, 24)];
  const fw = new Firmware(m, allScreens);
  const drive = new MemoryDrive(); installDrive(drive);
  diskState.device = 'BROWSER'; diskState.target = 'BROWSER'; diskState.name = ''; diskState.save = 'Save All Sequences & Songs';
  fw.key('SHIFT', true); fw.key('3'); fw.key('SHIFT', false);
  await tick();
  return { fw, m, drive };
};
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); if (i < 0) throw new Error(`no field ${id}: ${cf.fields.map(f => f.id).join(',')}`); fw.s.cursor[cf.def.id] = i; };
/** scroll the File: field to a name (bounded, so a missing file fails instead of hanging) */
const seek = (fw: Firmware, name: string) => { fw.wheel(-100); for (let i = 0; i < 20 && !lines(fw)[1].includes(name); i++) fw.wheel(1); if (!lines(fw)[1].includes(name)) throw new Error(`${name} not listed: ${lines(fw)[1]}`); };
const setSave = (fw: Firmware, idx: number) => { cursorTo(fw, 'type'); diskState.save = 'Save All Sequences & Songs'; fw.wheel(idx); };

describe('DISK', () => {
  it('saves every type to the browser disk and lists them', async () => {
    const { fw, drive } = await boot();
    expect(fw.s.mode).toBe('LOAD');
    fw.key('F2'); // SAVE page
    expect(lines(fw)[0]).toContain('Type:Save All Sequences & Songs');
    for (let i = 0; i < 5; i++) { setSave(fw, i); fw.key('F6'); await tick(); await tick(); }
    setSave(fw, 6); fw.key('F6'); await tick(); await tick(); // project bundle
    const names = (await drive.list('')).map(f => f.name).sort();
    expect(names).toEqual(['ALL_PGM_SND.APS', 'ALL_SEQ_SONG.ALL', 'Beat.MID', 'CHOPDECK_PROJECT.CHOPDECK', 'KICK.WAV', 'NewPgm-A.PGM']);
    fw.key('F1'); await tick();
    expect(lines(fw)[1]).toContain('File:');
    expect(lines(fw)[4]).toContain('/6 files');
  });
  it('loads a sequence from .MID into a chosen slot and a program from .PGM', async () => {
    const { fw, m } = await boot();
    fw.key('F2'); setSave(fw, 1); fw.key('F6'); await tick(); // Beat.MID
    setSave(fw, 3); fw.key('F6'); await tick(); // STARTER.PGM
    m.sequences[0].tracks[0].events = []; m.programs[0].used = false; m.programs[0].notes[0].snd = null; m.sounds = [];
    fw.key('F1'); await tick(); await refresh(fw.ctx());
    // pick Beat.MID
    const list = lines(fw); void list;
    cursorTo(fw, 'file'); seek(fw, 'BEAT.MID');
    fw.key('F6'); await tick();
    expect(lines(fw)[1]).toContain('Load a Sequence');
    cursorTo(fw, 'into'); fw.wheel(2); // Sq 3
    fw.key('F5'); // KEEP
    expect(m.sequences[2].tracks[32].events.length).toBe(1); // ch10 drums land on track 33
    expect(fw.s.seq).toBe(2);
    cursorTo(fw, 'file'); seek(fw, 'NEWPGM-A.PGM');
    fw.key('F6'); await tick();
    expect(lines(fw)[1]).toContain('Load a Program');
    fw.key('F5'); // LOAD
    expect(m.sounds.map(s => s.name)).toEqual(['KICK']);
    const pg = m.programs[m.drums[0].pgm];
    expect(pg.name).toBe('NewPgm-A');
    expect(pg.notes[35 - NOTE_MIN].snd).toBe(m.sounds[0].id);
  });
  it('folders: NEW, enter, save inside, rename, delete', async () => {
    const { fw, drive } = await boot();
    cursorTo(fw, 'file'); fw.key('WINDOW'); // Directory
    expect(lines(fw)[1]).toContain('Directory');
    fw.key('F5'); // NEW -> name window
    fw.padDown(5, 100); fw.padUp(5); // K
    fw.key('ENTER'); await tick();
    expect((await drive.list('')).map(f => f.name)).toEqual(['Kolder']);
    fw.key('RIGHT'); await tick();
    expect(fw.s.diskFolder).toBe('Kolder');
    fw.key('F4'); // Close
    fw.key('F2'); setSave(fw, 4); fw.key('F6'); await tick(); await tick(); // sound wav inside folder
    expect((await drive.list('Kolder')).map(f => f.name)).toEqual(['KICK.WAV']);
    fw.key('F1'); await tick(); fw.key('WINDOW');
    fw.key('LEFT'); await tick(); // back to root
    expect(fw.s.diskFolder).toBe('');
    fw.key('F2'); fw.key('F5'); await tick(); // DELETE folder -> DO IT
    expect((await drive.list('')).length).toBe(0);
  });
  it('the .ALL file restores sequences after a wipe', async () => {
    const { fw, m } = await boot();
    fw.key('F2'); fw.key('F6'); await tick(); await tick();
    m.sequences[0].tracks[0].events = []; m.sequences[0].name = 'Gone';
    fw.key('F1'); await tick(); cursorTo(fw, 'file'); seek(fw, 'ALL_SEQ_SONG.ALL');
    fw.key('F6'); await tick();
    expect(lines(fw)[1]).toContain('Load ALL file');
    fw.key('F5');
    expect(m.sequences[0].name).toBe('Beat');
    expect(m.sequences[0].tracks[0].events.length).toBe(1);
  });
});
