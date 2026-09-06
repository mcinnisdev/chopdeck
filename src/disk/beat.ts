// Beats for the site: a project manifest plus a preview mixdown rendered on the maker's computer,
// an MP3 of it, a waveform, and a share card drawn on a canvas. Remix lineage is a note this browser
// keeps until the next publish.
import { Mp3Encoder } from '@breezystack/lamejs';
import { Machine } from '@/model/types';
import { bounce } from '@/audio/bounce';
import { peaksOf } from './sample';
import { encodeProject } from './formats';
import { machineFromManifest, type ProjectManifest } from './manifest';

/** 16-bit MP3 at `kbps`, mono or stereo. */
export function encodeMp3(pcm: Float32Array[], rate: number, kbps = 160): Uint8Array {
  const channels = Math.min(2, pcm.length);
  const enc = new Mp3Encoder(channels, rate, kbps);
  const toI16 = (a: Float32Array) => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(a[i] * 32767))); return o; };
  const l = toI16(pcm[0]); const r = channels === 2 ? toI16(pcm[1]) : undefined;
  const parts: Uint8Array[] = [];
  const block = 1152 * 8;
  for (let i = 0; i < l.length; i += block) {
    const out = channels === 2 ? enc.encodeBuffer(l.subarray(i, i + block), r!.subarray(i, i + block)) : enc.encodeBuffer(l.subarray(i, i + block));
    if (out.length) parts.push(new Uint8Array(out));
  }
  const tail = enc.flush(); if (tail.length) parts.push(new Uint8Array(tail));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const bytes = new Uint8Array(total); let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  return bytes;
}

export interface BeatSource { kind: 'sequence' | 'song'; index: number }

/** Tempo the source plays at, for the page. */
export function sourceBpm(m: Machine, src: BeatSource, masterTempo: number): number {
  if (src.kind === 'song') { const s = m.songs[src.index]; if (s.tempoSource === 'MAS') return s.tempo; const first = s.steps[0]?.seq; return first != null ? (m.sequences[first].tempoSource === 'MAS' ? masterTempo : m.sequences[first].tempo) : masterTempo; }
  const q = m.sequences[src.index]; return q.tempoSource === 'MAS' ? masterTempo : q.tempo;
}

/** Render the source with the machine's own engine and encode the preview. */
export async function renderBeat(m: Machine, src: BeatSource, masterTempo: number, drum = 0, onStep?: (s: string) => void): Promise<{ mp3: Uint8Array; durationMs: number; peaks: number[]; bpm: number }> {
  onStep?.('Mixing down');
  const { pcm, rate } = await bounce(m, { ...(src.kind === 'song' ? { song: src.index } : { seq: src.index }), masterTempo, drum, tailSec: 1.5 });
  onStep?.('Encoding MP3');
  await new Promise(r => setTimeout(r, 0));
  const mp3 = encodeMp3(pcm, rate, 160);
  return { mp3, durationMs: Math.round((pcm[0].length / rate) * 1000), peaks: peaksOf(pcm, 240), bpm: sourceBpm(m, src, masterTempo) };
}

/** The share card, 1200 by 630, in the machine's colours: title, handle, the waveform and a pad grid. */
export function drawBeatCard(cv: HTMLCanvasElement, info: { title: string; handle: string; peaks: number[]; pads: string[]; bpm: number }): void {
  cv.width = 1200; cv.height = 630;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1B1B1B'; g.fillRect(0, 0, 1200, 630);
  // chassis
  g.fillStyle = '#1F3F6E'; roundRect(g, 40, 40, 1120, 550, 22); g.fill();
  g.strokeStyle = '#101010'; g.lineWidth = 4; g.stroke();
  // LCD with the waveform
  g.fillStyle = '#101010'; roundRect(g, 80, 90, 700, 250, 8); g.fill();
  g.fillStyle = '#B7C58C'; roundRect(g, 92, 102, 676, 226, 4); g.fill();
  g.fillStyle = '#1C2814';
  const n = info.peaks.length || 1, bw = 640 / n;
  info.peaks.forEach((p, i) => { const h = Math.max(2, p * 150); g.fillRect(110 + i * bw, 215 - h / 2, Math.max(1, bw - 1), h); });
  g.font = 'bold 30px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillStyle = '#1C2814';
  g.fillText(`${info.bpm.toFixed(1)} BPM`, 110, 320);
  // title and handle
  g.fillStyle = '#FBF2DA'; g.font = 'bold 64px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText(fit(g, info.title.toUpperCase(), 690), 80, 430);
  g.fillStyle = '#E8412E'; g.font = 'bold 34px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText(`@${info.handle.toUpperCase()}`, 80, 480);
  g.fillStyle = '#FBF2DA'; g.font = '600 20px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText('A BEAT MADE ON CHOP DECK · CHOPDECK.COM', 80, 545);
  // pads
  g.fillStyle = '#FBF2DA'; roundRect(g, 820, 90, 300, 300, 12); g.fill(); g.strokeStyle = '#101010'; g.lineWidth = 3; g.stroke();
  const order = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
  order.forEach((pad, i) => {
    const x = 838 + (i % 4) * 68, y = 108 + Math.floor(i / 4) * 68;
    g.fillStyle = info.pads[pad] ? '#E8412E' : '#E6DCC0'; roundRect(g, x, y, 60, 60, 7); g.fill(); g.strokeStyle = '#101010'; g.lineWidth = 2; g.stroke();
  });
  g.fillStyle = '#F5B841'; g.font = 'bold 22px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.fillText('CHOPDECK', 840, 440);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g: CanvasRenderingContext2D, s: string, w: number): string { while (s.length > 3 && g.measureText(s).width > w) s = s.slice(0, -2).trimEnd() + '…'; return s; }

export function canvasPng(cv: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => cv.toBlob(b => b ? b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : reject(new Error('no png')), 'image/png'));
}

/** A beat as a .CHOPDECK file for the machine's LOAD flow. */
export function beatToProjectFile(manifest: ProjectManifest, blobs: Map<string, Uint8Array>): Uint8Array {
  const { machine, masterTempo } = machineFromManifest(manifest, blobs);
  return encodeProject(machine, masterTempo);
}

export { setRemixOf, getRemixOf } from './remix';
