// Pure PCM operations for TRIM / EDIT. Channels are Float32Array[]; frames are sample indices.
import { Sound } from '@/model/types';
import { newSound } from '@/model/factory';

export type Pcm = Float32Array[];

const clampRange = (len: number, from: number, to: number) => { const a = Math.max(0, Math.min(len, Math.floor(from))); const b = Math.max(a, Math.min(len, Math.floor(to))); return [a, b] as const; };

export function slice(pcm: Pcm, from: number, to: number): Pcm { const [a, b] = clampRange(pcm[0].length, from, to); return pcm.map(ch => ch.slice(a, b)); }
export function concat(a: Pcm, b: Pcm): Pcm {
  const chans = Math.max(a.length, b.length);
  return Array.from({ length: chans }, (_, i) => { const x = a[Math.min(i, a.length - 1)], y = b[Math.min(i, b.length - 1)]; const out = new Float32Array(x.length + y.length); out.set(x, 0); out.set(y, x.length); return out; });
}
/** Keep only [st, end). */
export function discard(pcm: Pcm, st: number, end: number): Pcm { return slice(pcm, st, end); }
/** Remove [from, to) and close the gap. */
export function deleteSection(pcm: Pcm, from: number, to: number): Pcm { const [a, b] = clampRange(pcm[0].length, from, to); return pcm.map(ch => { const out = new Float32Array(ch.length - (b - a)); out.set(ch.subarray(0, a), 0); out.set(ch.subarray(b), a); return out; }); }
export function silence(pcm: Pcm, from: number, to: number): Pcm { const [a, b] = clampRange(pcm[0].length, from, to); return pcm.map(ch => { const out = ch.slice(); out.fill(0, a, b); return out; }); }
export function reverse(pcm: Pcm, from: number, to: number): Pcm { const [a, b] = clampRange(pcm[0].length, from, to); return pcm.map(ch => { const out = ch.slice(); out.subarray(a, b).reverse(); return out; }); }
/** Insert `ins` at frame `at`. */
export function insert(pcm: Pcm, ins: Pcm, at: number): Pcm { const a = Math.max(0, Math.min(pcm[0].length, Math.floor(at))); return concat(concat(slice(pcm, 0, a), matchChannels(ins, pcm.length)), slice(pcm, a, pcm[0].length)); }
export function matchChannels(pcm: Pcm, n: number): Pcm { if (pcm.length === n) return pcm; if (n === 1) return [toMono(pcm)]; return [pcm[0], pcm[1] ?? pcm[0]]; }
export function toMono(pcm: Pcm): Float32Array { if (pcm.length === 1) return pcm[0].slice(); const out = new Float32Array(pcm[0].length); for (let i = 0; i < out.length; i++) out[i] = (pcm[0][i] + pcm[1][i]) * 0.5; return out; }
export function peak(pcm: Pcm, from = 0, to = pcm[0].length): number { let m = 0; for (const ch of pcm) for (let i = from; i < to; i++) m = Math.max(m, Math.abs(ch[i])); return m; }
export function normalize(pcm: Pcm, target = 0.98): Pcm { const p = peak(pcm); if (p === 0) return pcm.map(c => c.slice()); const g = target / p; return pcm.map(ch => ch.map(v => v * g)); }
export function gain(pcm: Pcm, g: number): Pcm { return pcm.map(ch => ch.map(v => v * g)); }

/** Short fades at cut points so slices never click. */
export function fadeEdges(pcm: Pcm, frames = 32): Pcm {
  return pcm.map(ch => { const out = ch.slice(); const n = Math.min(frames, Math.floor(out.length / 2)); for (let i = 0; i < n; i++) { const g = i / n; out[i] *= g; out[out.length - 1 - i] *= g; } return out; });
}

// ---------- resampling ----------
export type ResampleQuality = 'LOW' | 'MED' | 'HIGH';
export function resample(pcm: Pcm, fromRate: number, toRate: number, quality: ResampleQuality = 'HIGH'): Pcm {
  if (fromRate === toRate) return pcm.map(c => c.slice());
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(pcm[0].length / ratio));
  return pcm.map(ch => {
    const out = new Float32Array(outLen);
    if (quality === 'LOW') { for (let i = 0; i < outLen; i++) { const x = i * ratio; const i0 = Math.floor(x); const f = x - i0; out[i] = ch[i0] * (1 - f) + (ch[i0 + 1] ?? ch[i0] ?? 0) * f; } return out; }
    if (quality === 'MED') { for (let i = 0; i < outLen; i++) out[i] = cubic(ch, i * ratio); return out; }
    // windowed sinc (Lanczos a=3), with the kernel widened when downsampling so it also low-passes
    const a = 3; const scale = Math.min(1, 1 / ratio);
    for (let i = 0; i < outLen; i++) {
      const x = i * ratio; const c = Math.floor(x); let acc = 0, wsum = 0;
      const span = Math.ceil(a / scale);
      for (let k = c - span + 1; k <= c + span; k++) { const d = (x - k) * scale; if (Math.abs(d) >= a) continue; const w = lanczos(d, a); acc += (ch[k] ?? 0) * w; wsum += w; }
      out[i] = wsum ? acc / wsum : 0;
    }
    return out;
  });
}
function cubic(ch: Float32Array, x: number): number { const i = Math.floor(x); const f = x - i; const p0 = ch[i - 1] ?? ch[i] ?? 0, p1 = ch[i] ?? 0, p2 = ch[i + 1] ?? p1, p3 = ch[i + 2] ?? p2; return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0))); }
function lanczos(x: number, a: number): number { if (x === 0) return 1; const px = Math.PI * x; return (a * Math.sin(px) * Math.sin(px / a)) / (px * px); }

/** Reduce word length (16 -> n bits) the crunchy way: quantise. */
export function bitReduce(pcm: Pcm, bits: number): Pcm { const steps = Math.pow(2, Math.max(1, Math.min(16, bits)) - 1); return pcm.map(ch => ch.map(v => Math.round(v * steps) / steps)); }

// ---------- time stretch (WSOLA) ----------
export const STRETCH_PRESETS = ['FEM VOX', 'MALE VOX', 'LOW MALE VOX', 'VOCAL', 'HFREQ RHYTHM', 'MFREQ RHYTHM', 'LFREQ RHYTHM', 'PERCUSSION', 'LFREQ PERC.', 'STACCATO', 'LFREQ SLOW', 'MUSIC 1', 'MUSIC 2', 'MUSIC 3', 'SOFT PERC.', 'HFREQ ORCH.', 'LFREQ ORCH.', 'SLOW ORCH.'] as const;
const PRESET_WINDOW_MS = [40, 50, 60, 45, 20, 28, 40, 16, 30, 24, 70, 40, 50, 60, 30, 60, 80, 100];

/**
 * Stretch by `ratioPct` (50..200 = new length as % of old) without changing pitch.
 * quality A = full search, B = coarse search, C = plain overlap-add (the lo-fi one).
 */
export function timeStretch(pcm: Pcm, rate: number, ratioPct: number, preset = 11, quality: 'A' | 'B' | 'C' = 'A', adjust = 0): Pcm {
  const ratio = Math.max(0.5, Math.min(2, ratioPct / 100));
  const winMs = PRESET_WINDOW_MS[Math.max(0, Math.min(PRESET_WINDOW_MS.length - 1, preset))] * (1 + adjust / 100);
  const N = Math.max(64, Math.round((winMs / 1000) * rate)) & ~1;
  const hopOut = N >> 1;
  const hopIn = hopOut / ratio;
  const search = quality === 'A' ? N >> 2 : quality === 'B' ? N >> 3 : 0;
  const step = quality === 'A' ? 1 : 2;
  const inLen = pcm[0].length;
  const outLen = Math.round(inLen * ratio);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const mono = toMono(pcm);
  const out = pcm.map(() => new Float32Array(outLen + N));
  const norm = new Float32Array(outLen + N);
  let prevIn = 0;
  for (let k = 0, o = 0; o < outLen; k++, o += hopOut) {
    const nominal = k * hopIn;
    let best = Math.round(nominal);
    if (k > 0 && search > 0) {
      // the frame that best continues the previously copied one (which would naturally continue at prevIn + hopOut)
      const target = prevIn + hopOut;
      let bestScore = -Infinity;
      const lo = Math.max(0, Math.round(nominal) - search), hi = Math.min(inLen - N, Math.round(nominal) + search);
      for (let cand = lo; cand <= hi; cand += step) {
        let score = 0;
        for (let i = 0; i < N; i += 4) score += (mono[target + i] ?? 0) * (mono[cand + i] ?? 0);
        if (score > bestScore) { bestScore = score; best = cand; }
      }
    }
    best = Math.max(0, Math.min(Math.max(0, inLen - 1), best));
    prevIn = best;
    for (let c = 0; c < pcm.length; c++) for (let i = 0; i < N; i++) { const s = pcm[c][best + i]; if (s === undefined) break; out[c][o + i] += s * win[i]; if (c === 0) norm[o + i] += win[i]; }
  }
  return out.map(ch => { const r = new Float32Array(outLen); for (let i = 0; i < outLen; i++) r[i] = norm[i] > 1e-3 ? ch[i] / norm[i] : ch[i]; return r; });
}

// ---------- zones / slicing ----------
export function equalZones(st: number, end: number, n: number): { st: number; end: number }[] {
  const count = Math.max(1, Math.min(16, n)); const span = end - st;
  return Array.from({ length: count }, (_, i) => ({ st: st + Math.round((i * span) / count), end: st + Math.round(((i + 1) * span) / count) }));
}

/** Slice a sound by its zones into new sounds (`<name>1`.. with an end margin appended, except the last). */
export function sliceZones(sound: Sound, endMargin = 0): Sound[] {
  return sound.zones.map((z, i) => {
    const last = i === sound.zones.length - 1;
    const to = last ? z.end : Math.min(sound.length, z.end + endMargin);
    const pcm = fadeEdges(slice(sound.pcm, z.st, to), 8);
    const base = sound.name.slice(0, 15 - String(i + 1).length);
    return newSound(`${base}${i + 1}`, pcm, sound.rate);
  });
}

/** Beat-loop tempo of a region: beats over (end-st) frames. */
/**
 * Onsets for auto-chopping: energy in 10 ms hops, a rise over the recent average marks a hit, hits at
 * least 60 ms apart, the strongest `max` kept in time order. Frame 0 is always the first.
 */
export function detectOnsets(pcm: Pcm, rate: number, max = 16): number[] {
  const n = pcm[0]?.length ?? 0; if (!n) return [0];
  const hop = Math.max(1, Math.round(rate * 0.01));
  const frames = Math.ceil(n / hop);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) { let e = 0; const a = f * hop, b = Math.min(n, a + hop); for (const ch of pcm) for (let i = a; i < b; i++) e += ch[i] * ch[i]; energy[f] = Math.sqrt(e / Math.max(1, (b - a) * pcm.length)); }
  const cands: { f: number; s: number }[] = [];
  const minGap = Math.round(0.06 / 0.01);
  let avg = energy[0];
  for (let f = 1; f < frames; f++) {
    const rise = energy[f] - avg;
    avg = avg * 0.85 + energy[f] * 0.15;
    if (rise > 0.02 && energy[f] > 0.03 && (!cands.length || f - cands[cands.length - 1].f >= minGap)) cands.push({ f, s: rise });
    else if (cands.length && f - cands[cands.length - 1].f < minGap && rise > cands[cands.length - 1].s) cands[cands.length - 1] = { f, s: rise };
  }
  const keep = cands.filter(c => c.f > 2).sort((a, b) => b.s - a.s).slice(0, Math.max(0, max - 1)).map(c => c.f * hop).sort((a, b) => a - b);
  return [0, ...keep];
}

export function regionTempo(rate: number, st: number, end: number, beats: number): number { const sec = Math.max(1, end - st) / rate; return Math.round((60 / (sec / Math.max(1, beats))) * 10) / 10; }
