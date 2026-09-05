import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { NOTE_MIN } from '@/model/types';
import { planVoice } from '@/audio/params';
import { newNoteParams, newSound } from '@/model/factory';

const boot = () => { const fw = new Firmware(newMachineWithStarterProgram(), allScreens); fw.setMode('MIXER'); return fw; };
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); if (i < 0) throw new Error(`no field ${id}: ${cf.fields.map(f => f.id).join(',')}`); fw.s.cursor[cf.def.id] = i; };

describe('FX pages', () => {
  it('FXsend assigns a bus and a send level per strip', () => {
    const fw = boot();
    fw.key('F3'); // FXsend
    expect(lines(fw)[0]).toContain('FX send');
    fw.padDown(2, 100); fw.padUp(2);
    fw.wheel(1); // OFF -> M1
    expect(fw.m.programs[0].notes[37 - NOTE_MIN].fxBus).toBe('M1');
    fw.key('DOWN'); fw.wheel(40);
    expect(fw.m.programs[0].notes[37 - NOTE_MIN].fxSend).toBe(40);
    expect(lines(fw)[1].slice(6, 9)).toBe('M1 ');
    expect(lines(fw)[5].slice(6, 9)).toBe(' 40');
  });
  it('FXedit toggles modules and opens parameter windows', () => {
    const fw = boot();
    fw.key('F5'); // FXedit
    expect(lines(fw)[0]).toContain('Edit:MULTI FX1');
    cursorTo(fw, 'modDIST'); fw.wheel(1);
    expect(fw.m.fx.m1.dist.on).toBe(true);
    fw.key('F6'); // ON/OFF on the module under the cursor
    expect(fw.m.fx.m1.dist.on).toBe(false);
    cursorTo(fw, 'modECHO'); fw.key('WINDOW');
    expect(lines(fw)[1]).toContain('DELAY/ECHO');
    cursorTo(fw, 'delay'); fw.key('2'); fw.key('5'); fw.key('0'); fw.key('ENTER');
    expect(fw.m.fx.m1.echo.delayMs).toBe(250);
    fw.key('F4');
    cursorTo(fw, 'sel'); fw.wheel(2); // REVERB 1
    expect(lines(fw)[2]).toContain('Type:LARGE HALL');
    cursorTo(fw, 'time'); fw.wheel(20);
    expect(fw.m.fx.r1.time).toBe(70);
  });
  it('voice plan carries the send', () => {
    const np = newNoteParams(); np.fxBus = 'R2'; np.fxSend = 55;
    const plan = planVoice({ np, sound: newSound('s', [new Float32Array(10)], 44100), vel: 100, drumVol: 1 });
    expect(plan.fxBus).toBe('R2'); expect(plan.fxSend).toBe(55);
  });
});
