import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSequence } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { noteEvent } from '@/seq/events';
import { PPQ } from '@/model/types';

const BAR = PPQ * 4;
const boot = () => { const fw = new Firmware(newMachineWithStarterProgram(), allScreens); fw.m.sequences[0].used = true; fw.m.sequences[0].bars = 2; return fw; };
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); fw.s.cursor[cf.def.id] = i; };

describe('Timing Correct window', () => {
  it('quantises the current track with swing on DO IT', () => {
    const fw = boot();
    fw.m.sequences[0].tracks[0].events = [noteEvent(10, 35, 100, 10), noteEvent(30, 35, 100, 10)];
    fw.setMode('MAIN'); cursorTo(fw, 'timing'); fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Timing Correct');
    expect(lines(fw)[2]).toContain('Note value:1/16');
    expect(lines(fw)[2]).toContain('Swing%:50');
    cursorTo(fw, 'swing'); fw.wheel(12);
    fw.key('F5');
    expect(fw.m.sequences[0].tracks[0].events.map(e => e.tick)).toEqual([0, 24 + Math.round(0.12 * 48)]);
    expect(fw.s.undoAvailable).toBe(true);
  });
});

describe('Erase window', () => {
  it('erases only one pad, or only one kind', () => {
    const fw = boot();
    const tr = fw.m.sequences[0].tracks[0];
    tr.events = [noteEvent(0, 35, 100, 10), noteEvent(24, 36, 100, 10), { kind: 'cc', tick: 30, cc: 1, value: 1 }];
    fw.key('ERASE');
    expect(lines(fw)[1]).toContain('Erase');
    expect(lines(fw)[2]).toContain('Track: 1-Track-01');
    cursorTo(fw, 'note'); fw.padDown(1, 100); fw.padUp(1);
    expect(lines(fw)[5]).toContain('Notes:36/A02');
    fw.key('F5');
    expect(tr.events.map(e => e.kind === 'note' ? e.note : e.kind)).toEqual([35, 'cc']);
    fw.key('ERASE'); cursorTo(fw, 'mode'); fw.wheel(2); // ONLY ERASE
    cursorTo(fw, 'kind'); fw.wheel(2); // CONTROL CHANGE
    fw.key('F5');
    expect(tr.events.map(e => e.kind)).toEqual(['note']);
  });
});

describe('Locate window', () => {
  it('STORE and GO TO use the memories', () => {
    const fw = boot();
    fw.s.now = 200;
    fw.key('GOTO', true); fw.key('GOTO', false);
    expect(lines(fw)[1]).toContain('Locate');
    expect(lines(fw)[2]).toContain('Go to:001.03.08');
    cursorTo(fw, 'm0'); fw.key('F2'); // STORE into 1
    expect(fw.m.locateMemories[0]).toBe(200);
    fw.s.now = 0;
    fw.key('F5'); // GO TO memory 1
    expect(fw.s.now).toBe(200);
    expect(fw.s.windows).toHaveLength(0);
  });
});

describe('Tempo Change window', () => {
  it('INSERT / NOW / DELETE keep the list sorted and protect entry 1', () => {
    const fw = boot();
    cursorTo(fw, 'tempo'); fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Tempo Change');
    fw.key('F5'); // INSERT after entry 1 -> midpoint of the sequence
    const list = fw.m.sequences[0].tempoChanges;
    expect(list.length).toBe(2);
    expect(list[1].tick).toBe(BAR);
    expect(fw.m.sequences[0].tempoChangeOn).toBe(true);
    fw.key('F2'); // DELETE with cursor on entry 1 -> nothing
    expect(list.length).toBe(2);
    cursorTo(fw, 't1'); fw.s.now = 100; fw.key('F3'); // NOW
    expect(list[1].tick).toBe(100);
    cursorTo(fw, 'r1'); fw.wheel(100);
    expect(list[1].ratio).toBeCloseTo(1.1);
    fw.key('F2');
    expect(list.length).toBe(1);
  });
});

describe('Change Tsig, Count, IN/DEL, USER defaults', () => {
  it('changes the signature and drops beat-4 notes', () => {
    const fw = boot();
    fw.m.sequences[0].tracks[0].events = [noteEvent(3 * PPQ, 38, 100, 10), noteEvent(BAR, 36, 100, 10)];
    cursorTo(fw, 'tsig'); fw.key('WINDOW');
    cursorTo(fw, 'num'); fw.wheel(-1);
    fw.key('F5');
    expect(fw.m.sequences[0].tsigs).toEqual([{ fromBar: 0, num: 3, den: 4 }]);
    expect(fw.m.sequences[0].tracks[0].events.map(e => e.tick)).toEqual([3 * PPQ]);
    expect(lines(fw)[1]).toContain('Tsig: 3/ 4');
  });
  it('Count window opens Metronome Sound with drum fields', () => {
    const fw = boot();
    cursorTo(fw, 'count'); fw.key('WINDOW');
    expect(lines(fw)[2]).toContain('Count IN:OFF');
    fw.key('F5');
    expect(lines(fw)[1]).toContain('Metronome Sound');
    expect(lines(fw)[3]).toContain('Volume:100');
    fw.wheel(1);
    expect(lines(fw)[3]).toContain('Accent:37/A03');
  });
  it('inserts and deletes bars from Change Bars > IN/DEL', () => {
    const fw = boot();
    fw.m.sequences[0].tracks[0].events = [noteEvent(BAR, 36, 100, 10)];
    cursorTo(fw, 'bars'); fw.key('WINDOW'); fw.key('F3');
    expect(lines(fw)[1]).toContain('Insert/Delete Bars');
    cursorTo(fw, 'after'); fw.wheel(-2); // after bar 0
    fw.key('F2'); // INSERT 1 bar at the start
    expect(fw.m.sequences[0].bars).toBe(3);
    expect(fw.m.sequences[0].tracks[0].events[0].tick).toBe(2 * BAR);
    cursorTo(fw, 'bars'); fw.key('WINDOW'); fw.key('F3');
    cursorTo(fw, 'first'); cursorTo(fw, 'last'); fw.wheel(-10);
    fw.key('F5'); // DELETE bar 1
    expect(fw.m.sequences[0].bars).toBe(2);
    expect(fw.m.sequences[0].tracks[0].events[0].tick).toBe(BAR);
  });
  it('EDIT > USER defaults feed new sequences', () => {
    const fw = boot();
    fw.setMode('EDIT', 'USER');
    expect(lines(fw)[0]).toContain('Main screen user defaults');
    cursorTo(fw, 'bars'); fw.wheel(4);
    expect(fw.m.defaults.bars).toBe(4);
    const s = newSequence(5, fw.m.defaults);
    expect(s.bars).toBe(4);
  });
});
