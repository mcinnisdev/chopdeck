// Project (de)serialisation. PCM is kept out of the JSON and handed back as typed arrays keyed by sound id,
// so the disk layer can store audio as blobs and the project as text.
import { Machine, Sound } from './types';
import { newMachine } from './factory';

export interface SerializedProject {
  json: string;
  pcm: Record<string, Float32Array[]>;
}

type SoundMeta = Omit<Sound, 'pcm'>;

export function serializeMachine(m: Machine): SerializedProject {
  const pcm: Record<string, Float32Array[]> = {};
  const sounds: SoundMeta[] = m.sounds.map(s => { const { pcm: p, ...meta } = s; pcm[s.id] = p; return meta; });
  const json = JSON.stringify({ ...m, sounds });
  return { json, pcm };
}

export function deserializeMachine(p: SerializedProject): Machine {
  const raw = JSON.parse(p.json) as Omit<Machine, 'sounds'> & { sounds: SoundMeta[] };
  const base = newMachine();
  const m: Machine = { ...base, ...raw, sounds: raw.sounds.map(meta => ({ ...meta, pcm: p.pcm[meta.id] ?? [] })) };
  // forward-compatible defaults for fields added after a project was saved
  m.defaults = { ...base.defaults, ...raw.defaults };
  m.count = { ...base.count, ...raw.count };
  m.midi = { ...base.midi, ...raw.midi };
  m.sequences = raw.sequences.map((s, i) => ({ ...base.sequences[i], ...s, tracks: s.tracks.map((t, j) => ({ ...base.sequences[i].tracks[j], ...t })) }));
  m.programs = raw.programs.map((pg, i) => ({ ...base.programs[i], ...pg, notes: pg.notes.map((n, j) => ({ ...base.programs[i].notes[j], ...n })) }));
  return m;
}
