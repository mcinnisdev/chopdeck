import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSound } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { NOTE_MIN } from '@/model/types';
import { SoundApi, NoteVar } from '@/kernel/screen';

class SpySound implements SoundApi {
  calls: { drum: number; note: number; vel: number; nv?: NoteVar }[] = [];
  offs: number[] = [];
  noteOn(drum: number, note: number, vel: number, nv?: NoteVar) { this.calls.push({ drum, note, vel, nv }); }
  noteOff(_d: number, note: number) { this.offs.push(note); }
  click() {}
  now() { return 0; }
  playSound() {}
  stopAll() {}
  async decode() { return { pcm: [new Float32Array(100)], rate: 44100 }; }
  mixerChanged() {}
  ready() { return true; }
}

const boot = () => {
  const m = newMachineWithStarterProgram();
  const snd = newSound('KICK', [new Float32Array(1000)], 44100);
  m.sounds.push(snd);
  m.programs[0].notes[0].snd = snd.id; // note 35 = pad A01
  const fw = new Firmware(m, allScreens);
  const spy = new SpySound(); fw.sound = spy;
  return { fw, spy, m };
};
const lines = (fw: Firmware) => frameToLines(fw.render());

describe('pads and the sampler', () => {
  it('routes a pad to the drum slot of the current track with its velocity', () => {
    const { fw, spy } = boot();
    fw.padDown(0, 90); fw.padUp(0);
    expect(spy.calls).toEqual([{ drum: 0, note: 35, vel: 90, nv: undefined }]);
    expect(spy.offs).toEqual([35]);
  });
  it('FULL LEVEL forces 127 and bank B plays the next 16 notes', () => {
    const { fw, spy } = boot();
    fw.key('FULL_LEVEL'); fw.key('BANK_B');
    fw.padDown(16 + 2, 40);
    expect(spy.calls[0]).toMatchObject({ note: 35 + 18, vel: 127 });
  });
  it('a DRUM2 track plays through drum slot 2', () => {
    const { fw, spy, m } = boot();
    m.sequences[0].tracks[0].type = 'DRUM2';
    fw.padDown(0, 100);
    expect(spy.calls[0].drum).toBe(1);
  });
  it('16 LEVELS: window, TurnON, velocity ladder and tuning ladder', () => {
    const { fw, spy } = boot();
    fw.key('SIXTEEN_LEVELS');
    expect(lines(fw)[1]).toContain('Assign 16 levels');
    fw.padDown(0, 100); fw.padUp(0);           // picks note 35 as the source
    fw.key('F5');                              // TurnON
    expect(fw.s.sixteenLevels).toBe(true);
    spy.calls.length = 0;
    fw.padDown(0, 100); fw.padDown(15, 100);
    expect(spy.calls.map(c => [c.note, c.vel])).toEqual([[35, 7], [35, 127]]);
    fw.key('SIXTEEN_LEVELS'); // off
    expect(fw.s.sixteenLevels).toBe(false);
    fw.key('SIXTEEN_LEVELS'); fw.s.sixteen.param = 'NOTE VAR'; fw.s.sixteen.type = 'TUNING'; fw.s.sixteen.origPad = 4; fw.key('F5');
    spy.calls.length = 0;
    fw.padDown(3, 100); fw.padDown(5, 100);
    expect(spy.calls.map(c => c.nv)).toEqual([{ param: 'TUNING', value: 0 }, { param: 'TUNING', value: 20 }]);
  });
  it('NOTE VARIATION slider applies to the assigned note only', () => {
    const { fw, spy, m } = boot();
    m.noteVariation = { note: 35, param: 'DECAY', low: 0, high: 100, cc: 0 };
    fw.slider(127);
    fw.padDown(0, 100); fw.padDown(1, 100);
    expect(spy.calls[0].nv).toEqual({ param: 'DECAY', value: 100 });
    expect(spy.calls[1].nv).toBeUndefined();
  });
  it('SHIFT + AFTER opens the ASSIGN screen; the pad picks the note', () => {
    const { fw, m } = boot();
    fw.key('SHIFT', true); fw.key('AFTER'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('ASSIGN');
    fw.padDown(2, 100);
    expect(m.noteVariation.note).toBe(37);
    expect(lines(fw)[0]).toContain('Assign note:37/A03');
  });
});

describe('LOAD flow', () => {
  it('shows the import tray and keeps a decoded sound on the chosen note', async () => {
    const { fw, m } = boot();
    fw.s.importFiles.push({ name: 'break.wav', size: 2048, blob: new Blob([new Uint8Array(4)]) });
    fw.setMode('LOAD');
    expect(lines(fw)[1]).toContain('File:BREAK.WAV');
    fw.key('F6'); // DO IT
    expect(fw.s.windows[0].id).toBe('LOAD/SOUND');
    await new Promise(r => setTimeout(r, 0));
    expect(lines(fw)[5]).toContain('MONO  44100Hz');
    const before = m.sounds.length;
    fw.key('F5'); // KEEP
    expect(m.sounds.length).toBe(before + 1);
    expect(m.sounds[m.sounds.length - 1].name).toBe('BREAK');
    // assigned to the first free note (36 = pad A02)
    expect(m.programs[0].notes[36 - NOTE_MIN].snd).toBe(m.sounds[m.sounds.length - 1].id);
    expect(fw.s.importFiles).toHaveLength(0);
  });
});

describe('MIXER stereo page', () => {
  it('shows 16 strips, pads select the channel and the wheel edits level and pan', () => {
    const { fw, m } = boot();
    fw.key('SHIFT', true); fw.key('7'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('MIXER');
    const l = lines(fw);
    expect(l[0]).toContain('Stereo mix');
    expect(l[6].startsWith('01 02 03')).toBe(true);
    expect(l[1].startsWith('MIDMIDMID')).toBe(true);
    fw.padDown(4, 100); fw.padUp(4);     // channel 5
    fw.key('DOWN');                       // level row
    fw.wheel(-10);
    expect(m.programs[0].notes[39 - NOTE_MIN].vol).toBe(90);
    expect(lines(fw)[5].slice(12, 15)).toBe(' 90');
    fw.key('UP'); fw.wheel(-25);
    expect(lines(fw)[1].slice(12, 15)).toBe('L25');
    fw.key('F6'); // ALL CH link
    fw.key('DOWN'); fw.wheel(-5);
    expect(m.programs[0].notes[35 - NOTE_MIN].vol).toBe(95);
    expect(m.programs[0].notes[39 - NOTE_MIN].vol).toBe(85);
  });
  it('Channel Settings window opens on the selected strip', () => {
    const { fw } = boot();
    fw.setMode('MIXER');
    fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Channel Settings');
    expect(lines(fw)[2]).toContain('Note:35/A01-KICK');
  });
});
