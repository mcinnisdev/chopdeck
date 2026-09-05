// Mixdown: run the sequencer against an OfflineAudioContext and return the rendered stereo audio.
import { Machine } from '@/model/types';
import { newSession, Session } from '@/kernel/session';
import { Transport } from '@/seq/transport';
import { ManualClock } from '@/seq/clock';
import { AudioEngine } from './engine';
import { sequenceLengthTicks, tickToSeconds } from '@/model/time';
import { expandSong } from '@/seq/song';
import { TRACK_TYPES } from '@/model/types';

export interface BounceOpts { seq?: number; song?: number; masterTempo: number; drum: number; rate?: number; tailSec?: number }

function estimateSeconds(m: Machine, o: BounceOpts): number {
  const seqs = o.song != null ? expandSong(m.songs[o.song]) : [o.seq ?? 0];
  const song = o.song != null ? m.songs[o.song] : null;
  let sec = 0;
  for (const i of seqs) { const q = m.sequences[i]; const tempo = song && song.tempoSource === 'MAS' ? song.tempo : q.tempoSource === 'MAS' ? o.masterTempo : q.tempo; sec += tickToSeconds(tempo, q.tempoChangeOn, q.tempoChanges, sequenceLengthTicks(q)); }
  return sec;
}

/** Render one pass of a sequence (loop ignored) or a whole song. */
export async function bounce(m: Machine, o: BounceOpts): Promise<{ pcm: Float32Array[]; rate: number }> {
  const rate = o.rate ?? 44100;
  const tail = o.tailSec ?? 2;
  const total = Math.max(0.5, estimateSeconds(m, o)) + tail;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * rate), rate);
  let t = 0;
  // a view of the machine with the bounced sequence's loop off, so the pass ends
  const machine: Machine = o.seq != null ? { ...m, sequences: m.sequences.map((q, i) => (i === o.seq ? { ...q, loop: { ...q.loop, on: false } } : q)) } : m;
  const engine = new AudioEngine(() => machine, { context: ctx, now: () => t });
  engine.boot();
  const s: Session = newSession();
  s.masterTempo = o.masterTempo; s.drum = o.drum;
  if (o.song != null) { s.mode = 'SONG'; s.song = o.song; } else s.seq = o.seq ?? 0;
  const host = {
    m: machine, s, sound: engine, touch() {}, snapshotForUndo() {},
    padTarget(pad: number) { const pg = machine.programs[machine.drums[s.drum].pgm]; return { drum: s.drum, note: pg.padToNote[pad], program: machine.drums[s.drum].pgm }; },
  };
  const clock = new ManualClock();
  const transport = new Transport(host, clock);
  transport.play(true);
  const limit = total - tail;
  while (s.playing && t < limit + 0.2) { t += 0.05; clock.pump(); }
  const end = Math.min(total, (s.playing ? limit : t) + tail);
  transport.stop();
  const buf = await ctx.startRendering();
  const frames = Math.min(buf.length, Math.ceil(end * rate));
  const pcm = [buf.getChannelData(0).slice(0, frames), buf.getChannelData(1).slice(0, frames)];
  void TRACK_TYPES;
  return { pcm, rate };
}
