import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSound } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { noteEvent } from '@/seq/events';
import { stepState } from './step';
import { editState } from './edit';
import { PPQ } from '@/model/types';

const BAR = PPQ * 4;
const boot = () => {
  const m = newMachineWithStarterProgram();
  const snd = newSound('K', [new Float32Array(10)], 44100); m.sounds.push(snd); m.programs[0].notes[0].snd = snd.id;
  const fw = new Firmware(m, allScreens);
  const q = m.sequences[0]; q.used = true; q.bars = 2;
  q.tracks[0].events = [noteEvent(0, 35, 100, 20), noteEvent(0, 36, 80, 10), noteEvent(48, 35, 90, 20)];
  return { fw, m };
};
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); if (i < 0) throw new Error(`no field ${id} in ${cf.def.id}: ${cf.fields.map(f => f.id).join(',')}`); fw.s.cursor[cf.def.id] = i; };

describe('STEP EDIT', () => {
  it('lists the events at Now, edits a field, moves with STEP keys', () => {
    const { fw, m } = boot();
    fw.key('F1'); // STEP from MAIN
    expect(fw.s.mode).toBe('STEP');
    const l = lines(fw);
    expect(l[0]).toContain('View:ALL EVENTS');
    expect(l[1]).toContain('> N:35/A01');
    expect(l[1]).toContain('V:100');
    expect(l[2]).toContain('> N:36/A02');
    cursorTo(fw, 'e0.v'); fw.wheel(-30);
    expect((m.sequences[0].tracks[0].events[0] as { vel: number }).vel).toBe(70);
    fw.key('STEP_R'); fw.key('STEP_R'); // 2 x 1/16 = tick 48
    expect(lines(fw)[1]).toContain('> N:35/A01');
    expect(lines(fw)[0]).toContain('Now:001.01.48');
  });
  it('COPY / PASTE / DELETE and multi-select edit', () => {
    const { fw, m } = boot();
    fw.setMode('STEP');
    const tr = m.sequences[0].tracks[0];
    cursorTo(fw, 'e0.n'); fw.key('F2'); // COPY event 0
    expect(stepState.clipboard).toHaveLength(1);
    fw.key('STEP_R'); fw.key('F5'); fw.key('F5'); // PASTE > MERGE at tick 24
    expect(tr.events.filter(e => e.tick === 24)).toHaveLength(1);
    fw.key('STEP_L');
    cursorTo(fw, 'e0.v');
    fw.key('SHIFT', true); fw.key('DOWN'); fw.key('SHIFT', false); // select rows 0-1
    expect(lines(fw)[7]).toContain('EDIT');
    fw.key('F4'); // Edit Multiple
    expect(lines(fw)[1]).toContain('Edit Multiple');
    cursorTo(fw, 'type'); fw.wheel(3); // SET TO VAL
    cursorTo(fw, 'value'); fw.key('1'); fw.key('2'); fw.key('7'); fw.key('ENTER');
    fw.key('F5');
    expect(tr.events.filter(e => e.tick === 0).map(e => (e as { vel: number }).vel)).toEqual([127, 127]);
    cursorTo(fw, 'e1.n'); fw.key('F3'); // DELETE second event
    expect(tr.events.filter(e => e.tick === 0)).toHaveLength(1);
  });
  it('INSERT adds a default event; step recording writes a note and auto-steps', () => {
    const { fw, m } = boot();
    fw.setMode('STEP');
    fw.key('BAR_R'); // bar 2 (empty)
    fw.key('F4'); // INSERT
    cursorTo(fw, 'type'); fw.wheel(2); // CONTROL CHANGE
    fw.key('F5');
    const tr = m.sequences[0].tracks[0];
    expect(tr.events.find(e => e.tick === BAR)?.kind).toBe('cc');
    fw.key('STEP_R');
    fw.padDown(1, 90); fw.padUp(1);
    const rec = tr.events.find(e => e.tick === BAR + 24);
    expect(rec).toMatchObject({ kind: 'note', note: 36, vel: 90 });
    expect(fw.s.now).toBe(BAR + 48); // auto step increment
    stepState.autoStep = false;
    fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('Step Edit Options');
    stepState.autoStep = true;
  });
});

describe('EDIT screen', () => {
  it('EVENTS COPY copies a range into another track with copies', () => {
    const { fw, m } = boot();
    fw.key('F2'); // EDIT
    expect(fw.s.mode).toBe('EDIT'); expect(fw.s.page.EDIT).toBe('EVENTS');
    expect(lines(fw)[0]).toContain('Edit:COPY');
    cursorTo(fw, 'toTr'); fw.wheel(1); // track 2
    cursorTo(fw, 'to'); fw.key('2'); fw.key('ENTER'); // to = bar 2 start
    cursorTo(fw, 'copies'); fw.wheel(1); // 2 copies
    fw.key('F6'); // DO IT
    const dst = m.sequences[0].tracks[1].events;
    expect(dst.length).toBe(6);
    expect(dst.map(e => e.tick)).toEqual([0, 0, 48, BAR, BAR, BAR + 48]);
  });
  it('VELOCITY edit and TRANSPOSE on MIDI track only', () => {
    const { fw, m } = boot();
    fw.setMode('EDIT', 'EVENTS');
    cursorTo(fw, 'op'); fw.wheel(2); // VELOCITY
    cursorTo(fw, 'type'); fw.wheel(3); // SET TO VAL
    cursorTo(fw, 'value'); fw.key('5'); fw.key('0'); fw.key('ENTER');
    fw.key('F6');
    expect(m.sequences[0].tracks[0].events.map(e => (e as { vel: number }).vel)).toEqual([50, 50, 50]);
    cursorTo(fw, 'op'); fw.wheel(1); // TRANSPOSE
    cursorTo(fw, 'amount'); fw.wheel(2);
    fw.key('F6');
    expect((m.sequences[0].tracks[0].events[0] as { note: number }).note).toBe(35); // drum track untouched
    m.sequences[0].tracks[0].type = 'MIDI';
    fw.key('F6');
    expect((m.sequences[0].tracks[0].events[0] as { note: number }).note).toBe(37);
  });
  it('BARS copies bars into another sequence; TrMOVE reorders tracks', () => {
    const { fw, m } = boot();
    fw.setMode('EDIT', 'BARS');
    cursorTo(fw, 'toSeq'); fw.wheel(1); // Sq 2
    cursorTo(fw, 'last'); fw.wheel(-5); // bar 1 only
    fw.key('F6');
    expect(m.sequences[1].bars).toBe(1);
    expect(m.sequences[1].tracks[0].events.map(e => e.tick)).toEqual([0, 0, 48]);
    fw.setMode('EDIT', 'TRMOVE');
    m.sequences[0].tracks[0].name = 'Drums'; m.sequences[0].tracks[0].used = true;
    fw.key('F6'); // SELECT track 1
    expect(editState.moveSel).toBe(0);
    fw.wheel(2); fw.key('F6'); // INSERT at position 3
    expect(m.sequences[0].tracks[2].name).toBe('Drums');
    expect(fw.s.track).toBe(2);
  });
});

describe('MISC', () => {
  it('auto punch limits recording to the window; 2nd sequence toggles', () => {
    const { fw } = boot();
    fw.key('SHIFT', true); fw.key('2'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('MISC'); expect(lines(fw)[0]).toContain('Auto Punch');
    fw.key('F6'); // TurnON
    expect(fw.s.punch).toMatchObject({ mode: 'PUNCH IN OUT', in: 0, out: BAR });
    expect(lines(fw)[5]).toContain('Auto punch function is active!!');
    fw.key('F3'); // 2ndSEQ
    fw.key('F6');
    expect(fw.s.secondSeq).toBe(1);
    fw.key('F6');
    expect(fw.s.secondSeq).toBeNull();
  });
});
