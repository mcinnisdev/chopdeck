import { describe, it, expect } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram } from '@/model/factory';
import { allScreens } from '@/screens';
import { frameToLines } from '@/lcd/frame';
import { noteEvent } from '@/seq/events';
import { Transport } from '@/seq/transport';
import { ManualClock } from '@/seq/clock';
import { convertSong, expandSong } from '@/seq/song';
import { SoundApi, NoteVar } from '@/kernel/screen';
import { PPQ } from '@/model/types';

const BAR = PPQ * 4;
class FakeSound implements SoundApi {
  t = 0; ons: { note: number; when: number }[] = [];
  noteOn(_d: number, note: number, _v: number, _nv?: NoteVar, when?: number) { this.ons.push({ note, when: when ?? this.t }); }
  noteOff() {} click() {} now() { return this.t; } playSound() {} stopAll() {} async decode() { return { pcm: [new Float32Array(1)], rate: 44100 }; } mixerChanged() {} ready() { return true; }
}
const boot = () => {
  const m = newMachineWithStarterProgram();
  const a = m.sequences[0]; a.used = true; a.bars = 1; a.name = 'Verse'; a.tracks[0].events = [noteEvent(0, 35, 100, 10)];
  const b = m.sequences[1]; b.used = true; b.bars = 1; b.name = 'Chorus'; b.tracks[0].events = [noteEvent(0, 36, 100, 10)];
  const fw = new Firmware(m, allScreens);
  const sound = new FakeSound(); fw.sound = sound;
  const clock = new ManualClock(); fw.transport = new Transport(fw, clock);
  const run = (sec: number) => { const end = sound.t + sec; while (sound.t < end - 1e-9) { sound.t = Math.min(end, sound.t + 0.025); clock.pump(); } };
  return { fw, m, sound, run };
};
const lines = (fw: Firmware) => frameToLines(fw.render());
const cursorTo = (fw: Firmware, id: string) => { const cf = fw.cursorField()!; const i = cf.fields.findIndex(f => f.id === id); if (i < 0) throw new Error(`no field ${id}: ${cf.fields.map(f => f.id).join(',')}`); fw.s.cursor[cf.def.id] = i; };

describe('SONG mode', () => {
  it('builds steps from the (end of song) row, edits reps, inserts and deletes', () => {
    const { fw, m } = boot();
    fw.key('SHIFT', true); fw.key('1'); fw.key('SHIFT', false);
    expect(fw.s.mode).toBe('SONG');
    expect(lines(fw)[0]).toContain('Song:01-(Song01)');
    expect(lines(fw)[2]).toContain('(end of song)');
    cursorTo(fw, 's0'); fw.wheel(1); // append step: sequence 2
    const song = m.songs[0];
    expect(song.steps).toEqual([{ seq: 1, reps: 1 }]);
    expect(lines(fw)[2]).toContain('1   02-Chorus');
    cursorTo(fw, 'r0'); fw.wheel(2);
    expect(song.steps[0].reps).toBe(3);
    fw.key('F6'); // INSERT after step 1
    expect(song.steps.length).toBe(2);
    cursorTo(fw, 's1'); fw.wheel(-1);
    expect(song.steps[1].seq).toBe(0);
    fw.key('F5'); // DELETE step 2
    expect(song.steps.length).toBe(1);
  });
  it('plays steps with repeats and stops at the end', () => {
    const { fw, m, sound, run } = boot();
    m.songs[0].steps = [{ seq: 0, reps: 2 }, { seq: 1, reps: 1 }]; m.songs[0].used = true;
    m.songs[0].tempoSource = 'MAS'; m.songs[0].tempo = 120;
    fw.setMode('SONG');
    fw.key('PLAY_START');
    expect(fw.s.songPlaying).toBe(true);
    run(6.5); // 3 bars at 2 s + tail
    expect(sound.ons.map(o => o.note)).toEqual([35, 35, 36]);
    expect(fw.s.playing).toBe(false);
  });
  it('loops the song when LOOP is on', () => {
    const { fw, m, sound, run } = boot();
    m.songs[0].steps = [{ seq: 0, reps: 1 }, { seq: 1, reps: 1 }]; m.songs[0].loop = { on: true, first: 1, last: 2 };
    fw.setMode('SONG'); fw.key('PLAY_START');
    run(6.2);
    expect(sound.ons.map(o => o.note)).toEqual([35, 36, 35, 36]);
    expect(fw.s.playing).toBe(true);
    fw.key('STOP');
  });
  it('converts a song to a sequence', () => {
    const { fw, m } = boot();
    m.songs[0].steps = [{ seq: 0, reps: 2 }, { seq: 1, reps: 1 }];
    expect(expandSong(m.songs[0])).toEqual([0, 0, 1]);
    const seq = convertSong(m, m.songs[0], 'REFERENCED TO 1ST SQ');
    expect(seq.bars).toBe(3);
    expect(seq.tracks[0].events.map(e => [e.tick, (e as { note: number }).note])).toEqual([[0, 35], [BAR, 35], [2 * BAR, 36]]);
    fw.setMode('SONG'); fw.key('F4'); // CONVRT window
    expect(lines(fw)[1]).toContain('Convert Song to Seq');
    cursorTo(fw, 'to'); fw.wheel(4); // to Sq 5
    fw.key('F5');
    expect(m.sequences[4].bars).toBe(3);
    expect(m.sequences[4].name).toBe('Song01');
  });
});
