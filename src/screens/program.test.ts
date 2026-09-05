import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachine, newSound } from '@/model/factory';
import { NOTE_MIN, NOTE_MAX } from '@/model/types';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';

const lines = (fw: Firmware) => frameToLines(fw.render());
/** Boot, enter PROGRAM mode with SHIFT+6 and pick DRUM 1. */
function enter() {
  const fw = new Firmware(newMachine(), allScreens);
  fw.key('SHIFT', true); fw.key('6'); fw.key('SHIFT', false);
  expect(fw.s.windows.map(w => w.id)).toEqual(['PROGRAM/SELECT_DRUM']);
  fw.key('F1');
  return fw;
}
const kick = () => newSound('kick', [new Float32Array(10)], 44100);

// Landable field indices on the ASSIGN page (row/col order): pgm, pgmName, pad, padNote, padAssign, note, snd, mode
const A = { pgm: 0, name: 1, pad: 2, padNote: 3, padAssign: 4, note: 5, snd: 6, mode: 7 };
// PARAMS page: pgm, note, tune, attack, freq, decay, reson, dcyMode, overlap
const P = { pgm: 0, note: 1, tune: 2, attack: 3, freq: 4, decay: 5, reson: 6, dcyMode: 7, overlap: 8 };

describe('PROGRAM mode entry and ASSIGN golden', () => {
  it('selects DRUM 1 and renders the ASSIGN page for a fresh machine', () => {
    const fw = enter();
    expect(fw.s.mode).toBe('PROGRAM');
    expect(fw.s.page.PROGRAM).toBe('ASSIGN');
    expect(fw.s.drum).toBe(0);
    expect(fw.s.windows).toHaveLength(0);
    const l = lines(fw);
    expect(l[0]).toBe('Pgm: 1-NewPgm-A');
    expect(l[1]).toBe('Pad:A01=Note:35     Pad assign:PROGRAM');
    expect(l[2]).toBe('Note:60=Snd:OFF');
    expect(l[3]).toBe('Mode:NORMAL');
    expect(l[7]).toContain('ASSIGN');
    expect(l[7]).toContain('PLAY');
  });
  it('DRUM 3 binds the selected program to that drum slot', () => {
    const fw = new Firmware(newMachine(), allScreens);
    fw.key('SHIFT', true); fw.key('6'); fw.key('SHIFT', false);
    fw.key('F3');
    expect(fw.s.drum).toBe(2);
    expect(fw.s.program).toBe(fw.m.drums[2].pgm);
    expect(lines(fw)[0]).toBe('Pgm: 3-NewPgm-C');
  });
  it('switches pages via the soft keys', () => {
    const fw = enter();
    fw.key('F2'); expect(fw.s.page.PROGRAM).toBe('PARAMS');
    expect(lines(fw)[1]).toBe('<Envelope>      <Filter>      Tune:   0');
    fw.key('F3'); expect(fw.s.page.PROGRAM).toBe('DRUM');
    expect(lines(fw)[0]).toBe('Drum:1                Pad to internal sound: ON');
    fw.key('F4'); expect(fw.s.page.PROGRAM).toBe('PURGE');
    expect(lines(fw)[7]).toContain('DO IT');
    fw.key('F1'); expect(fw.s.page.PROGRAM).toBe('ASSIGN');
  });
  it('wheel on Pgm selects the program and binds the drum', () => {
    const fw = enter();
    fw.s.cursor['PROGRAM/ASSIGN'] = A.pgm;
    fw.wheel(2);
    expect(fw.s.program).toBe(2);
    expect(fw.m.drums[0].pgm).toBe(2);
    expect(lines(fw)[0]).toBe('Pgm: 3-NewPgm-C');
  });
  it('PLAY auditions the selected note on the selected drum', () => {
    const fw = enter();
    const calls: unknown[][] = [];
    fw.sound = { ...fw.sound, noteOn: (...a: unknown[]) => calls.push(['on', ...a]), noteOff: (...a: unknown[]) => calls.push(['off', ...a]) } as typeof fw.sound;
    fw.key('F6'); fw.key('F6', false);
    expect(calls).toEqual([['on', 0, 60, 127], ['off', 0, 60]]);
  });
});

describe('ASSIGN page behaviour', () => {
  it('hitting pad 5 selects A06 and note 40', () => {
    const fw = enter();
    fw.padDown(5, 100); fw.padUp(5);
    expect(fw.s.pad).toBe(5);
    expect(fw.s.note).toBe(40);
    expect(lines(fw)[1]).toBe('Pad:A06=Note:40     Pad assign:PROGRAM');
    expect(lines(fw)[2]).toBe('Note:40=Snd:OFF');
  });
  it('assigns a sound to the note with the wheel on Snd and marks the program used', () => {
    const fw = enter();
    const s = kick(); fw.m.sounds.push(s);
    fw.s.cursor['PROGRAM/ASSIGN'] = A.snd;
    fw.wheel(1);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].snd).toBe(s.id);
    expect(fw.m.programs[0].used).toBe(true);
    expect(lines(fw)[2]).toBe('Note:60=Snd:kick');
    fw.wheel(-1);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].snd).toBeNull();
    expect(lines(fw)[2]).toBe('Note:60=Snd:OFF');
  });
  it('VEL SW shows the two switch rows', () => {
    const fw = enter();
    fw.s.cursor['PROGRAM/ASSIGN'] = A.mode;
    fw.wheel(2);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].mode).toBe('VEL SW');
    const l = lines(fw);
    expect(l[3]).toBe('Mode:VEL SW');
    expect(l[4]).toBe('If over: 44, use:--/OFF');
    expect(l[5]).toBe('If over: 88, use:--/OFF');
    fw.key('DOWN'); fw.key('RIGHT'); // use0
    fw.wheel(1);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].alt[0].note).toBe(35);
    expect(lines(fw)[4]).toBe('If over: 44, use:35/A01');
  });
  it('SIMULT shows the Also play note rows', () => {
    const fw = enter();
    fw.s.cursor['PROGRAM/ASSIGN'] = A.mode;
    fw.wheel(1);
    const l = lines(fw);
    expect(l[4]).toBe('Also play note:--/OFF');
    expect(l[5]).toBe('Also play note:--/OFF');
  });
  it('wheel on =Note: remaps the pad and follows the master map when MASTER', () => {
    const fw = enter();
    fw.s.cursor['PROGRAM/ASSIGN'] = A.padNote;
    fw.wheel(3);
    expect(fw.m.programs[0].padToNote[0]).toBe(38);
    expect(fw.s.note).toBe(38);
    fw.m.programs[0].padAssign = 'MASTER';
    fw.wheel(1);
    expect(fw.m.masterPadToNote[0]).toBe(36);
    expect(fw.m.programs[0].padToNote[0]).toBe(38);
  });
  it('Initialize pad assign restores the default map', () => {
    const fw = enter();
    fw.m.programs[0].padToNote[0] = 70;
    fw.s.cursor['PROGRAM/ASSIGN'] = A.padAssign;
    fw.key('WINDOW');
    expect(fw.s.windows[0].id).toBe('PROGRAM/INIT_PAD_ASSIGN');
    expect(lines(fw)[3]).toContain('Initialize pad assign:PROGRAM');
    fw.key('F5');
    expect(fw.m.programs[0].padToNote[0]).toBe(35);
    expect(fw.s.windows).toHaveLength(0);
  });
  it('Assignment View shows the 4x4 grid for the bank', () => {
    const fw = enter();
    const s = kick(); fw.m.sounds.push(s);
    fw.m.programs[0].notes[35 - NOTE_MIN].snd = s.id;   // pad A01
    fw.m.programs[0].notes[47 - NOTE_MIN].snd = s.id;   // pad A13
    fw.s.cursor['PROGRAM/ASSIGN'] = A.pad;
    fw.key('WINDOW');
    const l = lines(fw);
    expect(l[1]).toContain('Assignment View');
    expect(l[2]).toBe('Bank:A  Note:35=kick');
    expect(l[3]).toBe('kick        ---         ---         ---');
    expect(l[6]).toBe('kick        ---         ---         ---');
  });
});

describe('Program window', () => {
  it('NEW creates a program in the first unused slot and selects it', () => {
    const fw = enter();
    fw.m.programs[0].used = true;
    fw.s.cursor['PROGRAM/ASSIGN'] = A.pgm;
    fw.key('WINDOW');
    expect(fw.s.windows[0].id).toBe('PROGRAM/PROGRAM');
    fw.key('F3');
    expect(fw.s.windows[1].id).toBe('PROGRAM/NEW_PROGRAM');
    expect(lines(fw)[3]).toContain('New name:NewPgm-B');
    fw.key('F5');
    expect(fw.m.programs[1].used).toBe(true);
    expect(fw.m.programs[1].name).toBe('NewPgm-B');
    expect(fw.s.program).toBe(1);
    expect(fw.m.drums[0].pgm).toBe(1);
    expect(fw.s.windows).toHaveLength(0);
  });
  it('DELETE resets the program after confirmation', () => {
    const fw = enter();
    fw.m.programs[0].name = 'Kit'; fw.m.programs[0].used = true;
    fw.s.cursor['PROGRAM/ASSIGN'] = A.pgm;
    fw.key('WINDOW'); fw.key('F2');
    expect(lines(fw)[1]).toContain('Delete Program');
    expect(lines(fw)[2]).toContain('Pgm: 1-Kit');
    fw.key('F5');
    expect(fw.m.programs[0].name).toBe('NewPgm-A');
    expect(fw.m.programs[0].used).toBe(false);
    expect(fw.s.windows).toHaveLength(0);
  });
  it('COPY clones the program over the destination', () => {
    const fw = enter();
    fw.m.programs[0].name = 'Kit';
    fw.s.cursor['PROGRAM/ASSIGN'] = A.pgm;
    fw.key('WINDOW'); fw.key('F5');
    expect(fw.s.windows[1].id).toBe('PROGRAM/COPY_PROGRAM');
    expect(lines(fw)[5]).toContain('Pgm: 2-NewPgm-B');
    fw.key('F5');
    expect(fw.m.programs[1].name).toBe('Kit');
    expect(fw.m.programs[1]).not.toBe(fw.m.programs[0]);
    expect(fw.s.windows).toHaveLength(0);
  });
});

describe('PARAMS page', () => {
  it('renders the layout and accepts numeric entry on Tune', () => {
    const fw = enter();
    fw.key('F2');
    const l = lines(fw);
    expect(l[0]).toBe('Pgm: 1  Note:60/C05-OFF');
    expect(l[2]).toBe('Attack:  0      Freq:100      Voice');
    expect(l[3]).toBe('Decay:100       Reson:  0     Overlap:');
    expect(l[4]).toBe('Dcy md:END                    POLY');
    fw.s.cursor['PROGRAM/PARAMS'] = P.tune;
    fw.key('1'); fw.key('2'); fw.key('ENTER');
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].tune).toBe(12);
    expect(lines(fw)[1]).toBe('<Envelope>      <Filter>      Tune: +12');
    fw.wheel(-200);
    expect(lines(fw)[1]).toContain('Tune:-120');
  });
  it('Copy Note Parameters copies the source note over the destination', () => {
    const fw = enter();
    fw.key('F2');
    fw.m.programs[0].notes[60 - NOTE_MIN].attack = 55;
    fw.s.cursor['PROGRAM/PARAMS'] = P.note;
    fw.key('WINDOW');
    expect(fw.s.windows[0].id).toBe('PROGRAM/COPY_NOTE');
    expect(lines(fw)[3]).toContain('Prog: 1  Note:60/C05');
    expect(lines(fw)[5]).toContain('Prog: 1  Note:61/C#5');
    fw.key('F5');
    expect(fw.m.programs[0].notes[61 - NOTE_MIN].attack).toBe(55);
    expect(fw.m.programs[0].notes[61 - NOTE_MIN]).not.toBe(fw.m.programs[0].notes[60 - NOTE_MIN]);
    expect(fw.s.windows).toHaveLength(0);
  });
  it('Mute Assign wheel drops to OFF below the lowest note', () => {
    const fw = enter();
    fw.key('F2');
    fw.s.cursor['PROGRAM/PARAMS'] = P.overlap;
    fw.key('WINDOW');
    expect(fw.s.windows[0].id).toBe('PROGRAM/MUTE_ASSIGN');
    expect(lines(fw)[4]).toContain('Note:--/OFF');
    fw.wheel(1);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].mutes[0]).toBe(35);
    fw.wheel(-1);
    expect(fw.m.programs[0].notes[60 - NOTE_MIN].mutes[0]).toBe(0);
  });
  it('Velo windows open from the envelope, filter and tune fields', () => {
    const fw = enter();
    fw.key('F2');
    fw.s.cursor['PROGRAM/PARAMS'] = P.attack; fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Velo>>Envelope'); fw.key('WINDOW');
    fw.s.cursor['PROGRAM/PARAMS'] = P.freq; fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Velo/Env>>Filter'); fw.key('WINDOW');
    fw.s.cursor['PROGRAM/PARAMS'] = P.tune; fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Velo>>Pitch');
    expect(lines(fw)[3]).toContain('Prog tempo:---.-');
  });
});

describe('DRUM page', () => {
  it('changing Drum follows that slot program; Pgm rebinds the slot', () => {
    const fw = enter();
    fw.key('F3');
    fw.s.cursor['PROGRAM/DRUM'] = 0;
    fw.wheel(1);
    expect(fw.s.drum).toBe(1);
    expect(fw.s.program).toBe(1);
    expect(lines(fw)[1]).toBe('Pgm: 2-NewPgm-B');
    fw.key('DOWN'); // Pgm
    fw.wheel(3);
    expect(fw.m.drums[1].pgm).toBe(4);
    expect(fw.s.program).toBe(4);
    expect(lines(fw)[2]).toBe('Program Change:RECEIVE');
    expect(lines(fw)[3]).toBe('MIDI volume:RECEIVE   Current val.:127');
  });
});

describe('PURGE page', () => {
  it('removes unreferenced sounds and keeps referenced ones', () => {
    const fw = enter();
    const used = kick(); const unused = newSound('junk', [new Float32Array(10)], 44100);
    fw.m.sounds.push(used, unused);
    fw.m.programs[3].notes[40 - NOTE_MIN].snd = used.id;
    fw.s.sound = 1;
    fw.key('F4');
    expect(lines(fw)[4]).toBe('1 sounds not used in any program.');
    fw.key('F6');
    expect(fw.m.sounds.map(s => s.id)).toEqual([used.id]);
    expect(fw.s.sound).toBe(0);
    expect(lines(fw)[4]).toBe('0 sounds not used in any program.');
  });
});

describe('AUTO page', () => {
  it('Auto Chromatic Assignment fills all 64 notes with rising tune and renames', () => {
    const fw = enter();
    const s = kick(); fw.m.sounds.push(s);
    fw.m.programs[0].notes[60 - NOTE_MIN].snd = s.id;
    fw.key('F5');
    expect(fw.s.page.PROGRAM).toBe('AUTO');
    expect(fw.s.windows[0].id).toBe('PROGRAM/AUTO_CHROMATIC');
    const l = lines(fw);
    expect(l[2]).toContain('Source:60/C05-kick');
    expect(l[3]).toContain('Original key:60/C05');
    expect(l[4]).toContain('Tune:   0');
    expect(l[5]).toContain('Program name:NewPgm-A');
    fw.key('F5');
    const p = fw.m.programs[0];
    expect(p.notes.every(n => n.snd === s.id)).toBe(true);
    expect(p.notes[35 - NOTE_MIN].tune).toBe(-120);
    expect(p.notes[54 - NOTE_MIN].tune).toBe(-60);
    expect(p.notes[60 - NOTE_MIN].tune).toBe(0);
    expect(p.notes[66 - NOTE_MIN].tune).toBe(60);
    expect(p.notes[NOTE_MAX - NOTE_MIN].tune).toBe(120);
    expect(p.used).toBe(true);
    expect(fw.s.windows).toHaveLength(0);
    expect(fw.s.page.PROGRAM).toBe('ASSIGN');
  });
  it('CANCEL returns to ASSIGN', () => {
    const fw = enter();
    fw.key('F5'); fw.key('F4');
    expect(fw.s.windows).toHaveLength(0);
    expect(fw.s.page.PROGRAM).toBe('ASSIGN');
  });
});
