// The cloud form of a project: the machine as JSON with every sound replaced by the SHA-256 of its
// .SND bundle. Sounds are stored once per hash on the server; a manifest is a few kilobytes.
// Converting to and from the .CHOPDECK zip is `machineFromManifest` + `encodeProject`.
import { Machine, Sound } from '@/model/types';
import { newMachine } from '@/model/factory';
import { encodeSnd, decodeSnd } from './formats';

type SoundMeta = Omit<Sound, 'pcm'>;

export interface ProjectManifest {
  kind: 'CHOPDECK-MANIFEST';
  version: 1;
  title: string;
  masterTempo: number;
  /** The machine without pcm; sounds keep their metadata so the LCD can list them before audio arrives. */
  machine: Omit<Machine, 'sounds'> & { sounds: SoundMeta[] };
  /** sound id -> blob hash */
  blobs: Record<string, string>;
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

// Hashing a sound means encoding it, so remember the result per pcm buffer and re-do it only when
// the sound's metadata (trim, loop, zones, level, tune) has changed since.
const cache = new WeakMap<Float32Array, { meta: string; hash: string; bytes: Uint8Array }>();
const metaKey = (s: Sound) => { const { pcm, ...m } = s; void pcm; return JSON.stringify(m); };

/** The .SND bundle for a sound and its hash. */
export async function soundBlob(s: Sound): Promise<{ hash: string; bytes: Uint8Array }> {
  const key = s.pcm[0];
  const meta = metaKey(s);
  const hit = key && cache.get(key);
  if (hit && hit.meta === meta) return { hash: hit.hash, bytes: hit.bytes };
  const bytes = encodeSnd(s);
  const hash = await sha256(bytes);
  if (key) cache.set(key, { meta, hash, bytes });
  return { hash, bytes };
}

/** A project's title is the name of its first sequence; the machine has no other name for itself. */
export function projectTitle(m: Machine): string { return (m.sequences[0]?.name ?? 'Untitled').trim() || 'Untitled'; }

export async function buildManifest(m: Machine, masterTempo: number): Promise<{ manifest: ProjectManifest; blobs: Map<string, Uint8Array> }> {
  const blobs = new Map<string, Uint8Array>();
  const map: Record<string, string> = {};
  const sounds: SoundMeta[] = [];
  for (const s of m.sounds) {
    const { hash, bytes } = await soundBlob(s);
    blobs.set(hash, bytes);
    map[s.id] = hash;
    const { pcm, ...meta } = s; void pcm; sounds.push(meta);
  }
  const { sounds: _s, ...rest } = m; void _s;
  const manifest: ProjectManifest = { kind: 'CHOPDECK-MANIFEST', version: 1, title: projectTitle(m), masterTempo, machine: { ...rest, sounds }, blobs: map };
  return { manifest, blobs };
}

export function isManifest(x: unknown): x is ProjectManifest {
  return !!x && typeof x === 'object' && (x as ProjectManifest).kind === 'CHOPDECK-MANIFEST' && !!(x as ProjectManifest).machine;
}

/** Rebuild a machine from a manifest and the blobs it names. Sounds whose blob is missing come back silent. */
export function machineFromManifest(manifest: ProjectManifest, blobs: Map<string, Uint8Array>): { machine: Machine; masterTempo: number; missing: string[] } {
  const base = newMachine();
  const missing: string[] = [];
  const sounds: Sound[] = manifest.machine.sounds.map(meta => {
    const bytes = blobs.get(manifest.blobs[meta.id] ?? '');
    const decoded = bytes ? decodeSnd(bytes) : null;
    if (!decoded) { missing.push(meta.id); return { ...meta, pcm: [new Float32Array(0)], length: 0 } as Sound; }
    return { ...meta, pcm: decoded.pcm, rate: decoded.rate, channels: decoded.channels, length: decoded.length };
  });
  const machine: Machine = { ...base, ...manifest.machine, sounds };
  machine.defaults = { ...base.defaults, ...manifest.machine.defaults };
  machine.count = { ...base.count, ...manifest.machine.count };
  machine.midi = { ...base.midi, ...manifest.machine.midi };
  return { machine, masterTempo: manifest.masterTempo ?? 120, missing };
}
