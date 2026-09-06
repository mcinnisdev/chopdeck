// Samples for the library: a sound becomes a .SND blob plus a small waveform (peaks) and the numbers
// the library lists. Files chosen on the publish page are decoded here, in the page, with Web Audio.
import { Sound } from '@/model/types';
import { newSound } from '@/model/factory';

export const MAX_SAMPLE_SECONDS = 4 * 60;

/** `n` peak values (0..1) across the sound, for drawing a waveform without the audio. */
export function peaksOf(pcm: Float32Array[], n = 200): number[] {
  const len = pcm[0]?.length ?? 0;
  if (!len) return [];
  const out: number[] = [];
  const per = len / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * per), b = Math.min(len, Math.max(a + 1, Math.floor((i + 1) * per)));
    let peak = 0;
    for (const ch of pcm) for (let j = a; j < b; j++) { const v = Math.abs(ch[j]); if (v > peak) peak = v; }
    out.push(Math.round(Math.min(1, peak) * 100) / 100);
  }
  return out;
}

export const durationMs = (s: Sound) => Math.round((s.length / s.rate) * 1000);

/** Decode any audio file the browser understands into a Sound (mono or stereo, native rate). */
export async function decodeFileToSound(file: File, ctx: AudioContext): Promise<Sound> {
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  if (buf.duration > MAX_SAMPLE_SECONDS) throw new Error(`that is ${Math.round(buf.duration)} seconds; samples are at most ${MAX_SAMPLE_SECONDS / 60} minutes`);
  const channels = Math.min(2, buf.numberOfChannels);
  const pcm = Array.from({ length: channels }, (_, ch) => { const a = new Float32Array(buf.length); buf.copyFromChannel(a, ch); return a; });
  const name = file.name.replace(/\.[^.]+$/, '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 16) || 'SAMPLE';
  return newSound(name, pcm, buf.sampleRate);
}
