import { describe, it, expect, beforeEach } from 'vitest';
import { Firmware } from '@/kernel/firmware';
import { newMachineWithStarterProgram, newSound } from '@/model/factory';
import { allScreens } from '@/screens';
import { Transport } from './transport';
import { ManualClock } from './clock';
import { SoundApi, NoteVar } from '@/kernel/screen';
import { PPQ } from '@/model/types';

class FakeSound implements SoundApi {
  t = 0;
  ons: { drum: number; note: number; vel: number; when: number; nv?: NoteVar }[] = [];
  clicks: { accent: boolean; when: number }[] = [];
  noteOn(drum: number, note: number, vel: number, nv?: NoteVar, when?: number) { this.ons.push({ drum, note, vel, when: when ?? this.t, nv }); }
  noteOff() {}
  click(accent: boolean, _v: number, when?: number) { this.clicks.push({ accent, when: when ?? this.t }); }
  now() { return this.t; }
  playSound() {}
  stopAll() {}
  async decode() { return { pcm: [new Float32Array(1)], rate: 44100 }; }
  mixerChanged() {}
  ready() { return true; }
}

const BAR = PPQ * 4;
let fw: Firmware, sound: FakeSound, clock: ManualClock, tr: Transport;

/** advance the audio clock by `sec` in small steps, pumping the scheduler each step */
const run = (sec: number, step = 0.025) => { const end = sound.t + sec; while (sound.t < end - 1e-9) { sound.t = Math.min(end, sound.t + step); clock.pump(); } };

beforeEach(() => {
  const m = newMachineWithStarterProgram();
  const snd = newSound('K', [new Float32Array(100)], 44100);
  m.sounds.push(snd);
  m.programs[0].notes[0].snd = snd.id; // note 35
  m.programs[0].notes[1].snd = snd.id; // note 36
  fw = new Firmware(m, allScreens);
  sound = new FakeSound(); fw.sound = sound;
  clock = new ManualClock();
  tr = new Transport(fw, clock); fw.transport = tr;
  const seq = m.sequences[0]; seq.used = true; seq.bars = 1; seq.loop.on = true;
  fw.s.masterTempo = 120; // 1 bar = 2 s, 1 tick = 1/192 s
});

describe('playback', () => {
  it('schedules notes at the right audio time and loops', () => {
    fw.m.sequences[0].tracks[0].events = [{ kind: 'note', tick: 0, note: 35, vel: 100, dur: 10, nv: 0 }, { kind: 'note', tick: 96, note: 36, vel: 80, dur: 10, nv: 0 }];
    sound.t = 10;
    fw.key('PLAY_START');
    expect(fw.s.playing).toBe(true);
    run(2.6);
    const times = sound.ons.map(o => [o.note, Math.round((o.when - 10.03) * 1000) / 1000]);
    // first pass at 0 s and 0.5 s, second pass after the 2 s loop
    expect(times.slice(0, 4)).toEqual([[35, 0], [36, 0.5], [35, 2], [36, 2.5]]);
    expect(fw.s.now).toBeGreaterThanOrEqual(0);
    expect(fw.s.now).toBeLessThan(BAR);
  });
  it('stops at the end when Loop is OFF', () => {
    fw.m.sequences[0].loop.on = false;
    fw.key('PLAY_START');
    run(2.5);
    expect(fw.s.playing).toBe(false);
  });
  it('honours track ON/OFF, solo and Velo%', () => {
    const seq = fw.m.sequences[0];
    seq.tracks[0].events = [{ kind: 'note', tick: 0, note: 35, vel: 100, dur: 10, nv: 0 }];
    seq.tracks[1].events = [{ kind: 'note', tick: 0, note: 36, vel: 100, dur: 10, nv: 0 }];
    seq.tracks[1].veloPct = 50;
    seq.tracks[0].on = false;
    fw.key('PLAY_START'); run(0.3);
    expect(sound.ons.map(o => [o.note, o.vel])).toEqual([[36, 50]]);
  });
  it('follows a tempo change while playing', () => {
    fw.m.sequences[0].tracks[0].events = [{ kind: 'note', tick: 192, note: 35, vel: 100, dur: 10, nv: 0 }];
    fw.key('PLAY_START');
    run(0.2);
    fw.s.masterTempo = 240; // twice as fast from here on: remaining 0.8 s of beats now takes 0.4 s
    run(1);
    const when = sound.ons[0].when - 0.03;
    expect(when).toBeGreaterThan(0.55); expect(when).toBeLessThan(0.65);
  });
});

describe('recording', () => {
  it('REC arms, PLAY records a quantised pad with duration, loop turns REC into OVERDUB', () => {
    fw.key('REC');
    expect(fw.s.record).toBe('REC');
    fw.key('PLAY_START');
    run(0.26);                     // ~ tick 44 -> quantised to 48 (1/16 grid = 24)
    fw.padDown(0, 100);
    run(0.1);
    fw.padUp(0);
    const ev = fw.m.sequences[0].tracks[0].events;
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: 'note', note: 35, vel: 100, tick: 48 });
    expect((ev[0] as { dur: number }).dur).toBeGreaterThanOrEqual(15);
    run(2);                         // wrap
    expect(fw.s.record).toBe('OVERDUB');
    expect(fw.m.sequences[0].tracks[0].events).toHaveLength(1); // OVERDUB keeps it
    expect(fw.s.undoAvailable).toBe(true);
  });
  it('REC replaces existing events as the head passes, OVERDUB adds', () => {
    fw.m.sequences[0].tracks[0].events = [{ kind: 'note', tick: 0, note: 36, vel: 100, dur: 10, nv: 0 }, { kind: 'note', tick: 300, note: 36, vel: 100, dur: 10, nv: 0 }];
    fw.key('REC'); fw.key('PLAY_START');
    run(0.5);
    fw.key('STOP');
    const ticks = fw.m.sequences[0].tracks[0].events.map(e => e.tick);
    expect(ticks).toEqual([300]);   // the note at 0 was passed and replaced; 300 not reached yet
  });
  it('auto-appends bars while recording past the end with Loop OFF', () => {
    fw.m.sequences[0].loop.on = false;
    fw.key('OVERDUB'); fw.key('PLAY_START');
    run(2.4);
    expect(fw.m.sequences[0].bars).toBe(2);
    expect(fw.s.playing).toBe(true);
  });
  it('UNDO SEQ restores the pre-record state', () => {
    fw.key('OVERDUB'); fw.key('PLAY_START'); run(0.1); fw.padDown(0, 90); fw.padUp(0); fw.key('STOP');
    expect(fw.m.sequences[0].tracks[0].events).toHaveLength(1);
    fw.key('UNDO');
    expect(fw.m.sequences[0].tracks[0].events).toHaveLength(0);
    fw.key('UNDO');
    expect(fw.m.sequences[0].tracks[0].events).toHaveLength(1);
  });
  it('punch in with OVERDUB during playback', () => {
    fw.key('PLAY_START'); run(0.3);
    fw.key('OVERDUB');
    expect(fw.s.record).toBe('OVERDUB');
    fw.padDown(1, 70); fw.padUp(1);
    expect(fw.m.sequences[0].tracks[0].events[0]).toMatchObject({ note: 36, vel: 70 });
    fw.key('OVERDUB');
    expect(fw.s.record).toBe('OFF');
    expect(fw.s.playing).toBe(true);
  });
});

describe('count-in, metronome, note repeat, tap, erase', () => {
  it('count-in plays one bar of clicks before the first event', () => {
    fw.m.count.countIn = 'REC+PLAY';
    fw.m.sequences[0].tracks[0].events = [{ kind: 'note', tick: 0, note: 35, vel: 100, dur: 10, nv: 0 }];
    fw.key('PLAY_START'); run(2.2);
    expect(sound.clicks.length).toBeGreaterThanOrEqual(4);
    expect(sound.clicks[0].accent).toBe(true);
    expect(sound.ons[0].when - sound.clicks[0].when).toBeCloseTo(2, 1);
  });
  it('metronome clicks in play when In play is on', () => {
    fw.m.count.inPlay = true;
    fw.key('PLAY_START'); run(1.1);
    expect(sound.clicks.filter(c => c.when < 1.1).length).toBe(3); // beats at 0, .5, 1.0
  });
  it('note repeat emits on the timing grid while TAP is held, and records in overdub', () => {
    fw.m.timing = '1/8';
    fw.key('OVERDUB'); fw.key('PLAY_START');
    fw.key('TAP', true);
    fw.padDown(0, 100);
    run(1.0);
    fw.padUp(0); fw.key('TAP', false);
    const repeats = sound.ons.filter(o => o.note === 35);
    expect(repeats.length).toBeGreaterThanOrEqual(4);
    const ticks = fw.m.sequences[0].tracks[0].events.map(e => e.tick);
    expect(ticks.slice(0, 3)).toEqual([0, 48, 96]);
  });
  it('tap tempo averages taps', () => {
    const realNow = performance.now.bind(performance);
    let t = 1000; performance.now = () => t;
    try {
      fw.key('TAP'); fw.key('TAP', false); t += 500; fw.key('TAP'); fw.key('TAP', false); t += 500; fw.key('TAP'); fw.key('TAP', false);
      expect(fw.s.masterTempo).toBe(120);
      t += 400; fw.key('TAP'); fw.key('TAP', false); t += 400; fw.key('TAP'); fw.key('TAP', false); t += 400; fw.key('TAP'); fw.key('TAP', false);
      expect(fw.s.masterTempo).toBe(150);
    } finally { performance.now = realNow; }
  });
  it('ERASE + pad while overdubbing removes that note as the head passes', () => {
    fw.m.sequences[0].tracks[0].events = [{ kind: 'note', tick: 48, note: 35, vel: 100, dur: 10, nv: 0 }, { kind: 'note', tick: 48, note: 36, vel: 100, dur: 10, nv: 0 }];
    fw.key('OVERDUB'); fw.key('PLAY_START');
    fw.key('ERASE', true); fw.padDown(0, 100);
    run(0.6);
    fw.padUp(0); fw.key('ERASE', false);
    expect(fw.m.sequences[0].tracks[0].events.map(e => (e as { note: number }).note)).toEqual([36]);
  });
});
