import { describe, it, expect } from 'vitest';
import { planVoice, resolveNotes, ampEnvelope, cutoffHz, tuneToRate, sixteenLevelValue, sliderValue } from './params';
import { newNoteParams, newSound } from '@/model/factory';

const snd = () => newSound('s', [new Float32Array(44100)], 44100);

describe('param mapping', () => {
  it('maps filter index and tune', () => {
    expect(cutoffHz(100)).toBeCloseTo(20000);
    expect(cutoffHz(0)).toBeCloseTo(20);
    expect(tuneToRate(120)).toBeCloseTo(2);
    expect(tuneToRate(-120)).toBeCloseTo(0.5);
  });
  it('velocity scales level by default and not when Velo>Level is 0', () => {
    const np = newNoteParams();
    expect(planVoice({ np, sound: snd(), vel: 127, drumVol: 1 }).gain).toBeCloseTo(1);
    expect(planVoice({ np, sound: snd(), vel: 64, drumVol: 1 }).gain).toBeCloseTo(64 / 127);
    np.veloLevel = 0;
    expect(planVoice({ np, sound: snd(), vel: 10, drumVol: 1 }).gain).toBeCloseTo(1);
  });
  it('Velo>Start moves the start later for softer hits', () => {
    const np = newNoteParams(); np.veloStart = 50;
    const s = snd();
    expect(planVoice({ np, sound: s, vel: 127, drumVol: 1 }).startFrame).toBe(0);
    expect(planVoice({ np, sound: s, vel: 1, drumVol: 1 }).startFrame).toBeGreaterThan(20000);
  });
  it('note variation overrides tune/decay', () => {
    const np = newNoteParams();
    expect(planVoice({ np, sound: snd(), vel: 100, drumVol: 1, nv: { param: 'TUNING', value: 120 } }).rate).toBeCloseTo(2);
    expect(planVoice({ np, sound: snd(), vel: 100, drumVol: 1, nv: { param: 'DECAY', value: 0 } }).decaySec).toBe(0);
  });
});

describe('play modes', () => {
  it('velocity switch picks alternates above thresholds', () => {
    const np = newNoteParams(); np.mode = 'VEL SW'; np.alt = [{ note: 40, over: 44 }, { note: 50, over: 88 }];
    expect(resolveNotes(np, 36, 30, 100)).toEqual([36]);
    expect(resolveNotes(np, 36, 60, 100)).toEqual([40]);
    expect(resolveNotes(np, 36, 120, 100)).toEqual([50]);
  });
  it('simult plays all assigned notes', () => {
    const np = newNoteParams(); np.mode = 'SIMULT'; np.alt = [{ note: 40, over: 0 }, { note: 0, over: 0 }];
    expect(resolveNotes(np, 36, 100, 100)).toEqual([36, 40]);
  });
});

describe('amplitude envelope', () => {
  it('END mode with max decay barely touches a short sample', () => {
    const e = ampEnvelope({ attackSec: 0, decaySec: 5, decayMode: 'END', loop: false }, 0.5);
    expect(e.decayStart).toBe(0);
    expect(Math.exp(-0.5 / e.tau)).toBeGreaterThan(0.7);
    expect(e.stopAt).toBe(0.5);
  });
  it('START mode with short decay cuts the tail', () => {
    const e = ampEnvelope({ attackSec: 0, decaySec: 0.05, decayMode: 'START', loop: false }, 2);
    expect(e.stopAt).toBeLessThan(0.2);
  });
  it('short sample gives decay priority over attack', () => {
    const e = ampEnvelope({ attackSec: 1, decaySec: 0.4, decayMode: 'END', loop: false }, 0.5);
    expect(e.attackEnd).toBeCloseTo(0.1);
  });
});

describe('16 levels and slider', () => {
  it('tuning steps in semitones around the original key pad', () => {
    expect(sixteenLevelValue('TUNING', 3, 4, 0, 0)).toEqual({ param: 'TUNING', value: 0 });
    expect(sixteenLevelValue('TUNING', 15, 4, 0, 0)).toEqual({ param: 'TUNING', value: 120 });
  });
  it('slider maps into the assigned range', () => {
    expect(sliderValue('DECAY', 127, 16, 50)).toEqual({ param: 'DECAY', value: 50 });
    expect(sliderValue('DECAY', 0, 16, 50)).toEqual({ param: 'DECAY', value: 16 });
  });
});
