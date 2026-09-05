// A synthesised starter kit so the machine is never silent on first boot. No samples shipped, no licences.
import { Machine, Sound, NOTE_MIN } from '@/model/types';
import { newSound } from '@/model/factory';

const RATE = 44100;
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

function render(sec: number, fn: (t: number, i: number) => number): Float32Array {
  const n = Math.floor(sec * RATE); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i);
  // tiny fade at the end to avoid clicks
  const fade = Math.min(200, n); for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}
const onePoleHP = (buf: Float32Array, k: number) => { let y = 0, px = 0; for (let i = 0; i < buf.length; i++) { const x = buf[i]; y = k * (y + x - px); px = x; buf[i] = y; } return buf; };
const onePoleLP = (buf: Float32Array, k: number) => { let y = 0; for (let i = 0; i < buf.length; i++) { y += k * (buf[i] - y); buf[i] = y; } return buf; };
const normalize = (buf: Float32Array, peak = 0.9) => { let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / m; return buf; };

function kick(): Float32Array {
  let ph = 0;
  return normalize(render(0.45, (t, i) => { const f = 45 + 110 * Math.exp(-t * 28); ph += (2 * Math.PI * f) / RATE; const click = i < 60 ? (1 - i / 60) * 0.6 : 0; return Math.sin(ph) * Math.exp(-t * 7) + click; }));
}
function snare(): Float32Array {
  let ph = 0;
  const noise = onePoleHP(render(0.22, t => rnd() * Math.exp(-t * 18)), 0.9);
  return normalize(render(0.22, (t, i) => { ph += (2 * Math.PI * (185 - 40 * t)) / RATE; return Math.sin(ph) * Math.exp(-t * 22) * 0.6 + noise[i] * 0.8; }));
}
function hat(sec: number, decay: number): Float32Array {
  return normalize(onePoleHP(render(sec, t => rnd() * Math.exp(-t * decay)), 0.96), 0.7);
}
function clap(): Float32Array {
  const noise = onePoleHP(onePoleLP(render(0.3, () => rnd()), 0.35), 0.85);
  return normalize(render(0.3, (t, i) => { const bursts = [0, 0.012, 0.024]; let env = 0; for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) * 120)); env = Math.max(env, t > 0.03 ? Math.exp(-(t - 0.03) * 16) * 0.7 : 0); return noise[i] * env; }));
}
function rim(): Float32Array {
  let ph = 0;
  return normalize(render(0.06, (t, i) => { ph += (2 * Math.PI * 1150) / RATE; return Math.sin(ph) * Math.exp(-t * 90) + (i < 30 ? rnd() * 0.5 : 0); }));
}
function tom(f0: number, f1: number, sec: number): Float32Array {
  let ph = 0;
  return normalize(render(sec, t => { const f = f1 + (f0 - f1) * Math.exp(-t * 12); ph += (2 * Math.PI * f) / RATE; return Math.sin(ph) * Math.exp(-t * 6); }));
}
function bass(): Float32Array {
  let ph = 0;
  const raw = render(0.6, t => { ph += (2 * Math.PI * 55) / RATE; const saw = ((ph / (2 * Math.PI)) % 1) * 2 - 1; const sq = Math.sin(ph) > 0 ? 0.4 : -0.4; return (saw * 0.7 + sq) * Math.exp(-t * 4); });
  return normalize(onePoleLP(raw, 0.08));
}
function keys(): Float32Array {
  const notes = [261.63, 311.13, 392.0, 466.16];
  const phs = notes.map(() => 0);
  const raw = render(0.9, t => { let s = 0; notes.forEach((f, k) => { phs[k] += (2 * Math.PI * f) / RATE; s += Math.sin(phs[k]) * (1 + 0.3 * Math.sin(phs[k] * 2)) / notes.length; }); return s * Math.exp(-t * 3.2) * (1 - Math.exp(-t * 400)); });
  return normalize(onePoleLP(raw, 0.25));
}

export function starterSounds(): Sound[] {
  const mk = (name: string, pcm: Float32Array) => newSound(name, [pcm], RATE);
  return [
    mk('KICK', kick()), mk('SNARE', snare()), mk('HAT CL', hat(0.08, 60)), mk('HAT OP', hat(0.4, 9)),
    mk('CLAP', clap()), mk('RIM', rim()), mk('TOM LO', tom(140, 70, 0.5)), mk('TOM HI', tom(230, 150, 0.35)),
    mk('BASS A', bass()), mk('KEYS Cm7', keys()),
  ];
}

/** Install the kit into program 1 on pads A01..A10 of a fresh machine. */
export function installStarterKit(m: Machine): void {
  const sounds = starterSounds();
  m.sounds.push(...sounds);
  const pg = m.programs[0];
  pg.used = true; pg.name = 'STARTER';
  sounds.forEach((s, i) => { const note = pg.padToNote[i]; pg.notes[note - NOTE_MIN].snd = s.id; });
  // hi-hat choke: closed hat mutes the open hat
  const cl = pg.notes[pg.padToNote[2] - NOTE_MIN]; cl.mutes = [pg.padToNote[3], 0];
  const op = pg.notes[pg.padToNote[3] - NOTE_MIN]; op.overlap = 'MONO';
  // bass gets a lower filter and a START-mode decay so it plays like a real 90s sampler patch
  const b = pg.notes[pg.padToNote[8] - NOTE_MIN]; b.freq = 60; b.reson = 20;
}
