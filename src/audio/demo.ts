// Factory content: the starter kit, a two-bar break rendered from it (so there is something to chop),
// a chopped program, two sequences and a song. Everything is synthesised; nothing to license.
import { Machine, NOTE_MIN, PPQ } from '@/model/types';
import { newSound, newProgram } from '@/model/factory';
import { installStarterKit } from './starterKit';
import { equalZones, sliceZones, normalize } from './dsp';
import { insertEvent, noteEvent } from '@/seq/events';

const RATE = 44100;
const BPM = 93;
const BAR = PPQ * 4;

/** Mix the kit's PCM into a two-bar break at 93 BPM: a classic boom-bap pattern with a few ghost notes. */
function renderBreak(m: Machine): Float32Array {
  const pg = m.programs[0];
  const snd = (pad: number) => m.sounds.find(s => s.id === pg.notes[pg.padToNote[pad] - NOTE_MIN].snd);
  const kick = snd(0), snare = snd(1), hatC = snd(2), hatO = snd(3), rim = snd(5);
  const secPerTick = 60 / (BPM * PPQ);
  const total = Math.ceil(2 * BAR * secPerTick * RATE) + 2000;
  const out = new Float32Array(total);
  const hit = (s: ReturnType<typeof snd>, tick: number, gain: number) => { if (!s) return; const at = Math.round(tick * secPerTick * RATE); const src = s.pcm[0]; for (let i = 0; i < src.length && at + i < total; i++) out[at + i] += src[i] * gain; };
  const pattern: [ReturnType<typeof snd>, number, number][] = [];
  for (let bar = 0; bar < 2; bar++) {
    const b = bar * BAR;
    pattern.push([kick, b + 0, 1], [kick, b + 60, 0.8], [snare, b + PPQ, 1], [kick, b + PPQ * 2 + 48, 0.9], [snare, b + PPQ * 3, 1]);
    if (bar === 1) pattern.push([kick, b + PPQ * 3 + 72, 0.7], [rim, b + PPQ * 2 + 24, 0.5]);
    for (let s = 0; s < 8; s++) pattern.push([s === 7 && bar === 1 ? hatO : hatC, b + s * 48, s % 2 ? 0.45 : 0.7]);
  }
  for (const [s, t, g] of pattern) hit(s, t, g);
  // a little tape-ish softening: one-pole low-pass
  let y = 0; for (let i = 0; i < out.length; i++) { y += 0.55 * (out[i] - y); out[i] = y; }
  return normalize([out], 0.9)[0].slice(0, Math.ceil(2 * BAR * secPerTick * RATE));
}

/** Install the demo into a fresh machine: sounds, programs, sequences 1-2, song 1. Idempotent by name. */
export function installDemo(m: Machine): void {
  if (!m.sounds.length) installStarterKit(m);
  if (m.sounds.some(s => s.name === 'BREAK 93')) return;

  // the break and its chops on program 2 (DRUM2)
  const brk = newSound('BREAK 93', [renderBreak(m)], RATE);
  brk.beat = 8; brk.zones = equalZones(0, brk.length, 8);
  m.sounds.push(brk);
  const chops = sliceZones(brk, 0);
  m.sounds.push(...chops);
  const pg2 = newProgram(1, 'BREAK CHOPS'); pg2.used = true;
  chops.forEach((s, i) => { pg2.notes[pg2.padToNote[i] - NOTE_MIN].snd = s.id; });
  m.programs[1] = pg2;
  m.drums[1].pgm = 1;

  // sequence 1: the beat on the starter kit, bass and keys on tracks 2 and 3
  const seq = m.sequences[0];
  seq.used = true; seq.name = 'First Beat'; seq.bars = 2; seq.loop = { on: true, first: 1, last: 'END' }; seq.tempoSource = 'SEQ'; seq.tempo = BPM;
  const pad = (i: number) => m.programs[0].padToNote[i];
  const drums = seq.tracks[0]; drums.used = true; drums.name = 'Drums'; drums.type = 'DRUM1';
  for (let bar = 0; bar < 2; bar++) {
    const b = bar * BAR;
    [[0, 0, 110], [0, 60, 90], [1, PPQ, 118], [0, PPQ * 2 + 48, 100], [1, PPQ * 3, 118]].forEach(([p, t, v]) => insertEvent(drums.events, noteEvent(b + t, pad(p), v, 20)));
    for (let s = 0; s < 8; s++) insertEvent(drums.events, noteEvent(b + s * 48, pad(s === 7 && bar === 1 ? 3 : 2), s % 2 ? 60 : 92, 12));
    if (bar === 1) { insertEvent(drums.events, noteEvent(b + PPQ * 3 + 72, pad(0), 84, 20)); insertEvent(drums.events, noteEvent(b + PPQ * 2 + 24, pad(5), 70, 8)); }
  }
  const bass = seq.tracks[1]; bass.used = true; bass.name = 'Bass'; bass.type = 'DRUM1';
  [[0, 0, 40], [PPQ * 2 + 48, 0, 24], [BAR + 0, 0, 40], [BAR + PPQ * 2, 0, 20], [BAR + PPQ * 3 + 48, 0, 20]].forEach(([t, , d]) => insertEvent(bass.events, noteEvent(t, pad(8), 100, d)));
  const keys = seq.tracks[2]; keys.used = true; keys.name = 'Keys'; keys.type = 'DRUM1';
  insertEvent(keys.events, noteEvent(PPQ * 2, pad(9), 90, 160)); insertEvent(keys.events, noteEvent(BAR + PPQ * 2 + 48, pad(9), 80, 120));

  // sequence 2: the chops re-arranged on DRUM2
  const seq2 = m.sequences[1];
  seq2.used = true; seq2.name = 'Chop It'; seq2.bars = 2; seq2.loop = { on: true, first: 1, last: 'END' }; seq2.tempoSource = 'SEQ'; seq2.tempo = BPM;
  const ch = seq2.tracks[0]; ch.used = true; ch.name = 'Chops'; ch.type = 'DRUM2';
  const order = [0, 1, 2, 3, 0, 1, 6, 7, 4, 5, 2, 3, 0, 0, 6, 7];
  order.forEach((z, i) => insertEvent(ch.events, noteEvent(i * 48, pg2.padToNote[z], i % 4 === 0 ? 120 : 100, 44)));

  // song 1
  const song = m.songs[0];
  song.used = true; song.name = 'Demo Song'; song.tempoSource = 'SEQ';
  song.steps = [{ seq: 0, reps: 2 }, { seq: 1, reps: 2 }, { seq: 0, reps: 1 }];
}
