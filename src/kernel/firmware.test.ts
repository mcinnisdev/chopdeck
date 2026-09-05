import { describe, it, expect } from 'vitest';
import { Firmware } from './firmware';
import { newMachine } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines, ATTR_INVERSE } from '@/lcd/frame';

const boot = () => new Firmware(newMachine(), allScreens);
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorCells = (fw: Firmware) => {
  const f = fw.render(); const out: [number, number][] = [];
  for (let i = 0; i < f.attrs.length; i++) if (f.attrs[i] & ATTR_INVERSE && Math.floor(i / f.cols) < 7) out.push([Math.floor(i / f.cols), i % f.cols]);
  return out;
};

describe('MAIN screen golden', () => {
  it('renders the power-on main screen like the manual', () => {
    const l = lines(boot());
    expect(l[0]).toBe('Sq:01-(Sequence01)                 Now:001.01.00');
    expect(l[1]).toBe('♩:120.0(MAS)  Timing:1/16      Tsig: 4/ 4');
    expect(l[2]).toBe('Count:OFF  Loop:OFF  Bars:  0');
    expect(l[3]).toBe('Tr:01-(Track-01)        ON:YES   Pgm:OFF');
    expect(l[4]).toBe('S:DRUM1:OFF  NewPgm-A               Velo%:100');
    expect(l[7]).toContain('STEP');
    expect(l[7]).toContain('Tr +');
  });
  it('starts with the cursor on the sequence number', () => {
    expect(cursorCells(boot())).toEqual([[0, 3], [0, 4]]);
  });
});

describe('cursor and wheel', () => {
  it('moves right along the row and down to the nearest column', () => {
    const fw = boot();
    fw.key('RIGHT'); // seq name
    expect(cursorCells(fw)[0]).toEqual([0, 6]);
    fw.key('RIGHT'); // now
    expect(cursorCells(fw)[0]).toEqual([0, 39]);
    fw.key('DOWN');  // nearest on row 1 -> tsig (col 36)
    expect(cursorCells(fw)[0]).toEqual([1, 36]);
    fw.key('UP');
    expect(cursorCells(fw)[0]).toEqual([0, 39]);
  });
  it('wheel edits the field under the cursor', () => {
    const fw = boot();
    fw.wheel(3);
    expect(lines(fw)[0].startsWith('Sq:04-')).toBe(true);
    fw.key('DOWN'); // tempo
    fw.wheel(5);
    expect(lines(fw)[1].startsWith('♩:120.5')).toBe(true);
  });
  it('numeric entry commits on ENTER and shows while typing', () => {
    const fw = boot();
    fw.key('1'); fw.key('2');
    expect(lines(fw)[0].startsWith('Sq:12')).toBe(true);
    fw.key('ENTER');
    expect(fw.s.seq).toBe(11);
    fw.key('DOWN');
    fw.key('9'); fw.key('3'); fw.key('5'); fw.key('ENTER'); // 935 -> 93.5? three digits = 93.5 per hardware rule? we treat <=3 digits as whole bpm
    expect(fw.s.masterTempo).toBe(300); // clamped to max
    fw.key('1'); fw.key('2'); fw.key('0'); fw.key('5'); fw.key('ENTER');
    expect(fw.s.masterTempo).toBe(120.5);
  });
  it('cursor move cancels pending numeric entry', () => {
    const fw = boot();
    fw.key('7'); fw.key('RIGHT');
    expect(fw.s.numeric).toBeNull();
    expect(fw.s.seq).toBe(0);
  });
});

describe('modes and windows', () => {
  it('SHIFT + digit selects a mode and MAIN returns', () => {
    const fw = boot();
    fw.key('SHIFT', true); fw.key('5'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('TRIM');
    expect(lines(fw)[7]).toContain('LOOP');
    fw.key('F2');
    expect(fw.s.page.TRIM).toBe('LOOP');
    fw.key('MAIN');
    expect(fw.s.mode).toBe('MAIN');
  });
  it('OPEN WINDOW on Sq opens the Sequence window and WINDOW closes it', () => {
    const fw = boot();
    fw.key('WINDOW');
    expect(fw.s.windows.map(w => w.id)).toEqual(['MAIN/SEQUENCE']);
    expect(lines(fw)[1]).toContain('Sequence');
    fw.key('WINDOW');
    expect(fw.s.windows).toHaveLength(0);
  });
  it('confirm window runs DO IT on F5', () => {
    const fw = boot();
    fw.m.sequences[0].name = 'Break'; fw.m.sequences[0].used = true;
    fw.key('WINDOW'); fw.key('F2'); // DELETE
    expect(lines(fw)[1]).toContain('Delete Sequence');
    fw.key('F5');
    expect(fw.m.sequences[0].used).toBe(false);
    expect(fw.s.windows).toHaveLength(0);
  });
  it('Change Bars via wheel then DO IT', () => {
    const fw = boot();
    fw.s.cursor.MAIN = 9; // bars field
    fw.wheel(2);
    expect(fw.s.windows[0].id).toBe('MAIN/CHANGE_BARS');
    fw.key('F5');
    expect(fw.m.sequences[0].bars).toBe(2);
  });
});

describe('name window', () => {
  it('types with pads, cycles pairs, spaces with 16 LEVELS, commits with ENTER', () => {
    const fw = boot();
    fw.key('RIGHT'); // seq name field
    fw.padDown(0, 100); fw.padUp(0);        // A
    fw.padDown(0, 100); fw.padUp(0);        // cycles to B at same position
    fw.padDown(1, 100); fw.padUp(1);        // C
    fw.key('SIXTEEN_LEVELS');               // space
    fw.key('FULL_LEVEL');                   // lower case
    fw.padDown(2, 100); fw.padUp(2);        // e
    expect(fw.s.nameEdit?.value.trimEnd()).toBe('BC eence01');
    fw.key('ENTER');
    expect(fw.m.sequences[0].name).toBe('BC eence01');
    expect(fw.m.sequences[0].used).toBe(true);
    expect(lines(fw)[0].startsWith('Sq:01-BC eence01')).toBe(true);
  });
  it('CANCEL discards', () => {
    const fw = boot();
    fw.key('RIGHT'); fw.wheel(1);
    expect(fw.s.nameEdit).not.toBeNull();
    fw.key('F4');
    expect(fw.s.nameEdit).toBeNull();
    expect(fw.m.sequences[0].used).toBe(false);
  });
});

describe('transport stub and locate', () => {
  it('PLAY START, BAR >> and STEP < move Now', () => {
    const fw = boot();
    fw.key('PLAY_START');
    expect(fw.s.playing).toBe(true);
    fw.key('STOP');
    fw.key('BAR_R');
    expect(lines(fw)[0]).toContain('Now:002.01.00');
    fw.key('STEP_L');
    expect(lines(fw)[0]).toContain('Now:001.04.72');
    fw.key('GOTO', true); fw.key('BAR_L'); fw.key('GOTO', false);
    expect(fw.s.now).toBe(0);
  });
});
