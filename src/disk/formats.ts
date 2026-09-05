// File formats on the browser disk. Text where the hardware used text-ish data, ZIP bundles where audio rides along.
//   .ALL  JSON: all sequences and songs (+ timing, count, defaults)
//   .SEQ  JSON: one sequence
//   .MID  standard MIDI file
//   .PGM  zip: program.json + sounds/*.wav (+ sounds.json params)
//   .APS  zip: programs.json (all programs, drums, master pad map) + sounds/*.wav + sounds.json
//   .SND  zip: sound.json + audio.wav
//   .WAV  plain 16-bit PCM
import { Machine, Sequence, Song, Program, Sound, NUM_PROGRAMS, NUM_SEQUENCES, NUM_SONGS } from '@/model/types';
import { newMachine, newSound, newSequence, newProgram, newSong } from '@/model/factory';
import { encodeWav, decodeWav } from './wav';
import { zipStore, zipRead, ZipEntry } from './zip';

const enc = new TextEncoder(); const dec = new TextDecoder();
const json = (o: unknown) => enc.encode(JSON.stringify(o));
const parse = <T,>(b: Uint8Array) => JSON.parse(dec.decode(b)) as T;
type SoundMeta = Omit<Sound, 'pcm'>;
const meta = (s: Sound): SoundMeta => { const { pcm, ...m } = s; void pcm; return m; };

function soundEntries(sounds: Sound[]): ZipEntry[] {
  return [{ name: 'sounds.json', data: json(sounds.map(meta)) }, ...sounds.map(s => ({ name: `sounds/${s.id}.wav`, data: encodeWav(s.pcm, s.rate) }))];
}
function soundsFrom(entries: ZipEntry[]): Sound[] {
  const metas = entries.find(e => e.name === 'sounds.json'); if (!metas) return [];
  return parse<SoundMeta[]>(metas.data).map(m => {
    const wav = entries.find(e => e.name === `sounds/${m.id}.wav`);
    const d = wav ? decodeWav(wav.data) : null;
    return { ...m, pcm: d?.pcm ?? [new Float32Array(0)], rate: d?.rate ?? m.rate, length: d?.pcm[0]?.length ?? 0 } as Sound;
  });
}

// ---------- ALL / SEQ ----------
export interface AllFile { kind: 'ALL'; sequences: Sequence[]; songs: Song[]; timing: Machine['timing']; swing: number; count: Machine['count']; defaults: Machine['defaults']; masterTempo: number }
export function encodeAll(m: Machine, masterTempo: number): Uint8Array {
  const f: AllFile = { kind: 'ALL', sequences: m.sequences, songs: m.songs, timing: m.timing, swing: m.swing, count: m.count, defaults: m.defaults, masterTempo };
  return json(f);
}
export function decodeAll(bytes: Uint8Array): AllFile | null { try { const f = parse<AllFile>(bytes); return f.kind === 'ALL' && Array.isArray(f.sequences) ? f : null; } catch { return null; } }
export function applyAll(m: Machine, f: AllFile): void {
  const base = newMachine();
  m.sequences = Array.from({ length: NUM_SEQUENCES }, (_, i) => f.sequences[i] ? { ...base.sequences[i], ...f.sequences[i], tracks: f.sequences[i].tracks.map((t, j) => ({ ...base.sequences[i].tracks[j], ...t })) } : newSequence(i, f.defaults ?? m.defaults));
  m.songs = Array.from({ length: NUM_SONGS }, (_, i) => f.songs[i] ? { ...base.songs[i], ...f.songs[i] } : newSong(i));
  if (f.timing) m.timing = f.timing; if (f.swing) m.swing = f.swing; if (f.count) m.count = { ...m.count, ...f.count }; if (f.defaults) m.defaults = { ...m.defaults, ...f.defaults };
}
export function encodeSeq(seq: Sequence): Uint8Array { return json({ kind: 'SEQ', sequence: seq }); }
export function decodeSeq(bytes: Uint8Array): Sequence | null { try { const f = parse<{ kind: string; sequence: Sequence }>(bytes); if (f.kind !== 'SEQ') return null; const base = newSequence(0); return { ...base, ...f.sequence, tracks: f.sequence.tracks.map((t, j) => ({ ...base.tracks[j], ...t })) }; } catch { return null; } }

// ---------- PGM / APS ----------
function usedSounds(m: Machine, programs: Program[]): Sound[] {
  const ids = new Set(programs.flatMap(p => p.notes.map(n => n.snd).filter(Boolean) as string[]));
  return m.sounds.filter(s => ids.has(s.id));
}
export function encodePgm(m: Machine, program: Program, withSounds: boolean): Uint8Array {
  return zipStore([{ name: 'program.json', data: json(program) }, ...(withSounds ? soundEntries(usedSounds(m, [program])) : [{ name: 'sounds.json', data: json(usedSounds(m, [program]).map(meta)) }])]);
}
export function decodePgm(bytes: Uint8Array): { program: Program; sounds: Sound[]; missing: string[] } | null {
  const entries = zipRead(bytes); const p = entries.find(e => e.name === 'program.json'); if (!p) return null;
  const program = { ...newProgram(0), ...parse<Program>(p.data) };
  const sounds = soundsFrom(entries).filter(s => s.length > 0);
  const have = new Set(sounds.map(s => s.id));
  const metas = entries.find(e => e.name === 'sounds.json'); const all = metas ? parse<SoundMeta[]>(metas.data) : [];
  return { program, sounds, missing: all.filter(s => !have.has(s.id)).map(s => s.name) };
}
export function encodeAps(m: Machine, withSounds: boolean): Uint8Array {
  const head = { kind: 'APS', programs: m.programs, drums: m.drums, masterPadToNote: m.masterPadToNote, noteVariation: m.noteVariation };
  const sounds = withSounds ? m.sounds : [];
  return zipStore([{ name: 'programs.json', data: json(head) }, ...(withSounds ? soundEntries(sounds) : [{ name: 'sounds.json', data: json(m.sounds.map(meta)) }])]);
}
export function decodeAps(bytes: Uint8Array): { programs: Program[]; drums: Machine['drums']; masterPadToNote: number[]; sounds: Sound[] } | null {
  const entries = zipRead(bytes); const h = entries.find(e => e.name === 'programs.json'); if (!h) return null;
  const head = parse<{ programs: Program[]; drums: Machine['drums']; masterPadToNote: number[] }>(h.data);
  return { programs: Array.from({ length: NUM_PROGRAMS }, (_, i) => ({ ...newProgram(i), ...head.programs[i] })), drums: head.drums, masterPadToNote: head.masterPadToNote, sounds: soundsFrom(entries).filter(s => s.length > 0) };
}

// ---------- SND / WAV ----------
export function encodeSnd(s: Sound): Uint8Array { return zipStore([{ name: 'sound.json', data: json(meta(s)) }, { name: 'audio.wav', data: encodeWav(s.pcm, s.rate) }]); }
export function decodeSnd(bytes: Uint8Array): Sound | null {
  const entries = zipRead(bytes); const j = entries.find(e => e.name === 'sound.json'); const w = entries.find(e => e.name === 'audio.wav'); if (!j || !w) return null;
  const d = decodeWav(w.data); if (!d) return null;
  const m = parse<SoundMeta>(j.data);
  return { ...newSound(m.name, d.pcm, d.rate), ...m, pcm: d.pcm, rate: d.rate, length: d.pcm[0].length };
}
export function soundFromWav(name: string, bytes: Uint8Array): Sound | null { const d = decodeWav(bytes); return d ? newSound(name.replace(/\.[^.]+$/, '').toUpperCase().slice(0, 16), d.pcm, d.rate) : null; }

/** Merge sounds into the machine, replacing same-id sounds when asked. Returns the ids actually present afterwards. */
export function mergeSounds(m: Machine, sounds: Sound[], replaceSame: boolean): void {
  for (const s of sounds) {
    const i = m.sounds.findIndex(x => x.id === s.id);
    if (i < 0) m.sounds.push(s); else if (replaceSame) m.sounds[i] = s;
  }
}

/** Whole project as one zip: project.json (everything but pcm) + sounds/*.wav. */
export function encodeProject(m: Machine, masterTempo: number): Uint8Array {
  const { sounds, ...rest } = m;
  return zipStore([{ name: 'project.json', data: json({ kind: 'CHOPDECK', masterTempo, machine: { ...rest, sounds: sounds.map(meta) } }) }, ...sounds.map(s => ({ name: `sounds/${s.id}.wav`, data: encodeWav(s.pcm, s.rate) }))]);
}
export function decodeProject(bytes: Uint8Array): { machine: Machine; masterTempo: number } | null {
  const entries = zipRead(bytes); const p = entries.find(e => e.name === 'project.json'); if (!p) return null;
  const f = parse<{ kind: string; masterTempo: number; machine: Omit<Machine, 'sounds'> & { sounds: SoundMeta[] } }>(p.data);
  if (f.kind !== 'CHOPDECK') return null;
  const base = newMachine();
  const sounds = f.machine.sounds.map(sm => { const wav = entries.find(e => e.name === `sounds/${sm.id}.wav`); const d = wav ? decodeWav(wav.data) : null; return { ...sm, pcm: d?.pcm ?? [new Float32Array(0)], rate: d?.rate ?? sm.rate, length: d?.pcm[0]?.length ?? 0 } as Sound; });
  const machine: Machine = { ...base, ...f.machine, sounds };
  return { machine, masterTempo: f.masterTempo ?? 120 };
}
