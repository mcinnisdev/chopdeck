import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSound } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { NOTE_MIN } from '@/model/types';
import { SoundApi } from '@/kernel/screen';

class SpySound implements SoundApi {
  plays: { name: string; from?: number; to?: number; loop?: boolean }[] = [];
  noteOn() {} noteOff() {} click() {} now() { return 0; }
  playSound(s: string | { name: string }, o?: { from?: number; to?: number; loop?: boolean }) { this.plays.push({ name: typeof s === 'string' ? s : s.name, ...o }); }
  stopAll() {} async decode() { return { pcm: [new Float32Array(1)], rate: 44100 }; } mixerChanged() {} ready() { return true; }
}
const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin(i / 50) * (1 - i / n));
const boot = () => {
  const m = newMachineWithStarterProgram();
  m.sounds.push(newSound('BREAK', [ramp(44100)], 44100), newSound('PAD', [ramp(22050), ramp(22050)], 44100));
  const fw = new Firmware(m, allScreens); const spy = new SpySound(); fw.sound = spy;
  fw.key('SHIFT', true); fw.key('5'); fw.key('SHIFT', false);
  return { fw, spy, m };
};
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); if (i < 0) throw new Error(`no field ${id} in ${cf.def.id}`); fw.s.cursor[cf.def.id] = i; };

describe('TRIM page', () => {
  it('shows the sound, St/End edit with clamping, PLAY X auditions the range', () => {
    const { fw, spy, m } = boot();
    expect(fw.s.mode).toBe('TRIM');
    const l = lines(fw);
    expect(l[0].startsWith('Snd:BREAK')).toBe(true);
    expect(l[1]).toBe('St:       0  End:   44100');
    cursorTo(fw, 'st'); fw.wheel(1000);
    expect(m.sounds[0].st).toBe(1000);
    cursorTo(fw, 'end'); fw.key('5'); fw.key('0'); fw.key('0'); fw.key('ENTER');
    expect(m.sounds[0].end).toBe(1001); // clamped above st
    fw.key('9'); fw.key('9'); fw.key('9'); fw.key('9'); fw.key('9'); fw.key('ENTER');
    expect(m.sounds[0].end).toBe(44100);
    fw.key('F6', true);
    expect(spy.plays[0]).toMatchObject({ name: 'BREAK', from: 1000, to: 44100 });
    fw.key('F6', false);
    // stereo sound shows (ST) and a View field
    cursorTo(fw, 'snd'); fw.wheel(1);
    expect(lines(fw)[0]).toContain('PAD(ST)');
    expect(lines(fw)[1]).toContain('View:LEFT');
  });
  it('fine window zooms', () => {
    const { fw } = boot();
    cursorTo(fw, 'st'); fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Start fine');
    const z0 = fw.s.windows[0].params!.zoom as number;
    fw.key('F3'); expect(fw.s.windows[0].params!.zoom).toBe(z0 / 2);
    fw.key('F2'); fw.key('F2'); expect(fw.s.windows[0].params!.zoom).toBe(z0 * 2);
    fw.key('F4'); expect(fw.s.windows).toHaveLength(0);
  });
});

describe('LOOP and ZONE pages', () => {
  it('fit to length sets the loop; zones divide and boundaries move together', () => {
    const { fw, m } = boot();
    m.sounds[0].st = 100; m.sounds[0].end = 40100;
    fw.key('F2'); // LOOP page
    fw.key('F5'); fw.key('F5'); // EDIT -> Fit to length -> DO IT
    expect(m.sounds[0]).toMatchObject({ loopTo: 100, loopLength: 40000, loopOn: true });
    fw.key('F3'); // ZONE page
    cursorTo(fw, 'zone'); fw.key('WINDOW'); fw.wheel(3); fw.key('F5');
    expect(m.sounds[0].zones.length).toBe(4);
    expect(m.sounds[0].zones[0]).toEqual({ st: 100, end: 10100 });
    cursorTo(fw, 'zend'); fw.wheel(500);
    expect(m.sounds[0].zones[0].end).toBe(10600);
    expect(m.sounds[0].zones[1].st).toBe(10600);
    expect(lines(fw)[1]).toContain('Zone:  1/4');
  });
});

describe('EDIT window', () => {
  it('DISCARD trims, SECTION creates, TIME STRETCH lengthens', () => {
    const { fw, m } = boot();
    const s = m.sounds[0]; s.st = 1000; s.end = 21000;
    fw.key('F5'); // EDIT
    expect(lines(fw)[2]).toContain('Edit:DISCARD');
    fw.key('F5'); // DO IT
    expect(s.length).toBe(20000); expect(s.st).toBe(0); expect(s.end).toBe(20000);
    s.st = 0; s.end = 10000;
    fw.key('F5'); fw.wheel(2); // SECTION > NEW SOUND
    fw.key('F5');
    expect(m.sounds.length).toBe(3);
    expect(m.sounds[2].name).toBe('BREAK-S'); expect(m.sounds[2].length).toBe(10000);
    fw.s.sound = 0;
    fw.key('F5'); cursorTo(fw, 'op'); fw.wheel(8); // TIME STRETCH
    expect(lines(fw)[2]).toContain('TIME STRETCH');
    cursorTo(fw, 'ratio'); fw.wheel(500); // 150.00 %
    fw.key('F5');
    expect(m.sounds[3].name).toBe('BREAK-T');
    expect(m.sounds[3].length).toBe(15000);
  });
  it('SLICE SOUND from ZONE makes sounds and a program on the pads', () => {
    const { fw, m } = boot();
    fw.key('F3'); // ZONE
    cursorTo(fw, 'zone'); fw.key('WINDOW'); fw.wheel(3); fw.key('F5'); // 4 zones
    fw.key('F5'); // EDIT from zone page -> SLICE SOUND preselected
    expect(lines(fw)[2]).toContain('SLICE SOUND');
    cursorTo(fw, 'margin'); fw.wheel(100);
    fw.key('F5');
    expect(m.sounds.slice(2).map(s => s.name)).toEqual(['BREAK1', 'BREAK2', 'BREAK3', 'BREAK4']);
    expect(m.sounds[2].length).toBe(11025 + 100);
    const pgIndex = m.drums[0].pgm;
    const pg = m.programs[pgIndex];
    expect(pg.name).toBe('BREAK');
    expect(pg.notes[pg.padToNote[0] - NOTE_MIN].snd).toBe(m.sounds[2].id);
    expect(pg.notes[pg.padToNote[3] - NOTE_MIN].snd).toBe(m.sounds[5].id);
  });
});

describe('Sound window', () => {
  it('delete clears program references; convert and copy create sounds', () => {
    const { fw, m } = boot();
    m.programs[0].notes[0].snd = m.sounds[0].id;
    fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Sound');
    fw.key('F2'); fw.key('F5'); // DELETE -> DO IT
    expect(m.sounds.map(s => s.name)).toEqual(['PAD']);
    expect(m.programs[0].notes[0].snd).toBeNull();
    fw.key('WINDOW'); fw.key('F3'); // CONVRT (stereo -> mono default)
    expect(lines(fw)[2]).toContain('STEREO TO MONO');
    fw.key('F5');
    expect(m.sounds.map(s => s.name)).toEqual(['PAD', 'PAD-L', 'PAD-R']);
    fw.s.sound = 1;
    fw.key('WINDOW'); fw.key('F3'); cursorTo(fw, 'kind'); fw.wheel(1); // RE-SAMPLE
    cursorTo(fw, 'fs'); fw.wheel(-220); // 22050
    fw.key('F5');
    expect(m.sounds[3].rate).toBe(22100);
    expect(m.sounds[3].length).toBe(Math.round(22050 * 22100 / 44100));
    fw.key('WINDOW'); fw.key('F5'); fw.key('F5'); // COPY -> DO IT
    expect(m.sounds[4].name).toBe('PAD-L-R-C');
  });
});
