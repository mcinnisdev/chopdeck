// Song helpers: convert a song into one long sequence.
import { Machine, Song, Sequence, TRACK_TYPES } from '@/model/types';
import { newSequence } from '@/model/factory';
import { sequenceLengthTicks } from '@/model/time';
import { insertEvent } from './events';

export type ConvertMode = 'REFERENCED TO 1ST SQ' | 'OFF TRACKS IGNORED' | 'MERGED ON MIDI CH';

/** Expand the song's steps (with repeats) into a list of sequence indices. */
export function expandSong(song: Song): number[] {
  const out: number[] = [];
  for (const st of song.steps) { if (st.reps === 0) break; for (let r = 0; r < st.reps; r++) out.push(st.seq); }
  return out;
}

export function songLengthTicks(m: Machine, song: Song): number {
  return expandSong(song).reduce((a, i) => a + sequenceLengthTicks(m.sequences[i]), 0);
}

/** Build a new sequence from the song. Settings come from the first step's sequence. */
export function convertSong(m: Machine, song: Song, mode: ConvertMode): Sequence {
  const steps = expandSong(song);
  const first = m.sequences[steps[0] ?? 0];
  const out = newSequence(0, m.defaults);
  out.used = true; out.name = song.name.slice(0, 16);
  out.tempo = song.tempoSource === 'MAS' ? song.tempo : first.tempo; out.tempoSource = 'SEQ';
  out.tsigs = first.tsigs.map(t => ({ ...t }));
  out.loop = { on: false, first: 1, last: 'END' };
  out.tracks.forEach((t, i) => { const src = first.tracks[i]; t.name = src.name; t.used = src.used; t.type = src.type; t.channel = src.channel; t.on = true; t.pgm = src.pgm; t.veloPct = src.veloPct; });
  if (mode === 'MERGED ON MIDI CH') {
    out.tracks.forEach((t, i) => { t.name = i < 32 ? `MIDI ${i < 16 ? `${i + 1}A` : `${i - 15}B`}` : i < 36 ? `DRUM${i - 31}` : t.name; t.used = false; t.type = i >= 32 && i < 36 ? TRACK_TYPES[i - 31] : 'MIDI'; t.channel = i < 32 ? i + 1 : 0; });
  }
  let offset = 0; let bars = 0;
  for (const si of steps) {
    const q = m.sequences[si];
    q.tracks.forEach((tr, ti) => {
      if (mode === 'OFF TRACKS IGNORED' && !tr.on) return;
      let target = ti;
      if (mode === 'MERGED ON MIDI CH') { const d = TRACK_TYPES.indexOf(tr.type); target = d > 0 ? 31 + d : tr.channel > 0 ? tr.channel - 1 : ti; }
      const dst = out.tracks[target];
      for (const e of tr.events) { insertEvent(dst.events, { ...structuredClone(e), tick: e.tick + offset }); dst.used = true; }
    });
    offset += sequenceLengthTicks(q); bars += q.bars;
  }
  out.bars = bars;
  return out;
}
