import { describe, it, expect } from 'vitest';
import { serializeMachine, deserializeMachine } from './serialize';
import { newMachine, newSound } from './factory';

describe('serialize', () => {
  it('round-trips a machine and keeps pcm out of the json', () => {
    const m = newMachine();
    m.sequences[2].name = 'Break 93'; m.sequences[2].used = true; m.sequences[2].bars = 2;
    m.sequences[2].tracks[0].events.push({ kind: 'note', tick: 0, note: 36, vel: 100, dur: 24, nv: 0 });
    const snd = newSound('kick', [new Float32Array([0, 0.5, -0.5])], 44100);
    m.sounds.push(snd);
    m.programs[0].notes[1].snd = snd.id;
    const p = serializeMachine(m);
    expect(p.json).not.toContain('0.5,-0.5');
    expect(Object.keys(p.pcm)).toEqual([snd.id]);
    const back = deserializeMachine(p);
    expect(back.sequences[2].name).toBe('Break 93');
    expect(back.sequences[2].tracks[0].events[0]).toEqual({ kind: 'note', tick: 0, note: 36, vel: 100, dur: 24, nv: 0 });
    expect(back.sounds[0].pcm[0][1]).toBe(0.5);
    expect(back.programs[0].notes[1].snd).toBe(snd.id);
    expect(back.programs[1].notes[0].snd).toBeNull();
  });
});
