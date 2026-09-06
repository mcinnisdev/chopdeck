// A kit is a program (sixteen pads, note parameters, mixer settings) plus the sounds it uses. In the
// library it travels as a manifest with sounds by hash; on the machine it is an ordinary .PGM file.
import { Machine, Program, Sound, NOTE_MIN } from '@/model/types';
import { newMachine } from '@/model/factory';
import { encodePgm, decodeSnd } from './formats';
import { soundBlob } from './manifest';

type SoundMeta = Omit<Sound, 'pcm'>;

export interface KitManifest {
  kind: 'CHOPDECK-KIT';
  version: 1;
  title: string;
  program: Program;
  sounds: SoundMeta[];
  /** sound id -> blob hash */
  blobs: Record<string, string>;
}

/** The sounds a program's notes point at, in machine order. */
export function programSounds(m: Machine, program: Program): Sound[] {
  const ids = new Set(program.notes.map(n => n.snd).filter(Boolean) as string[]);
  return m.sounds.filter(s => ids.has(s.id));
}

/** Names of the sounds on pads 1 to 16 of bank A, '' where a pad is empty. */
export function padNames(m: Machine, program: Program): string[] {
  const map = program.padAssign === 'MASTER' ? m.masterPadToNote : program.padToNote;
  return Array.from({ length: 16 }, (_, i) => { const note = map[i]; const id = note ? program.notes[note - NOTE_MIN]?.snd : null; return id ? (m.sounds.find(s => s.id === id)?.name ?? '') : ''; });
}

export async function buildKit(m: Machine, program: Program): Promise<{ manifest: KitManifest; blobs: Map<string, Uint8Array>; pads: string[] }> {
  const blobs = new Map<string, Uint8Array>();
  const map: Record<string, string> = {};
  const sounds: SoundMeta[] = [];
  for (const s of programSounds(m, program)) {
    const { hash, bytes } = await soundBlob(s);
    blobs.set(hash, bytes); map[s.id] = hash;
    const { pcm, ...meta } = s; void pcm; sounds.push(meta);
  }
  // a kit carries its own pad map even if the program followed the master map
  const prog: Program = { ...program, padAssign: 'PROGRAM', padToNote: program.padAssign === 'MASTER' ? [...m.masterPadToNote] : [...program.padToNote] };
  return { manifest: { kind: 'CHOPDECK-KIT', version: 1, title: program.name, program: prog, sounds, blobs: map }, blobs, pads: padNames(m, program) };
}

export function isKitManifest(x: unknown): x is KitManifest {
  return !!x && typeof x === 'object' && (x as KitManifest).kind === 'CHOPDECK-KIT' && !!(x as KitManifest).program;
}

/** Sounds from a kit manifest and its blobs; entries without a blob are dropped. */
export function kitSounds(manifest: KitManifest, blobs: Map<string, Uint8Array>): Sound[] {
  const out: Sound[] = [];
  for (const meta of manifest.sounds) {
    const bytes = blobs.get(manifest.blobs[meta.id] ?? '');
    const d = bytes ? decodeSnd(bytes) : null;
    if (d) out.push({ ...meta, pcm: d.pcm, rate: d.rate, channels: d.channels, length: d.length });
  }
  return out;
}

/** The kit as a .PGM file the machine's LOAD screen already understands. */
export function kitToPgm(manifest: KitManifest, blobs: Map<string, Uint8Array>): Uint8Array {
  const tmp: Machine = { ...newMachine(), sounds: kitSounds(manifest, blobs) };
  return encodePgm(tmp, manifest.program, true);
}

/** The sound id on pad `pad` (0-based, bank A) of a kit, or null. */
export function kitPadSound(manifest: KitManifest, pad: number): string | null {
  const note = manifest.program.padToNote[pad];
  return note ? manifest.program.notes[note - NOTE_MIN]?.snd ?? null : null;
}
