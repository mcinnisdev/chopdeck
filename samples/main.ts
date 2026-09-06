// The samples library page: browse, play with a moving cursor over the waveform, send to the machine.
import { decodeSnd } from '@/disk/formats';
import { fetchBlobs } from '@/disk/sync';
import { putHandoff } from '@/disk/handoff';

interface Sample { id: string; slug: string; hash: string; title: string; description: string; tags: string[]; license: string; source: string; durationMs: number; rate: number; channels: number; bytes: number; peaks: number[]; downloads: number; featured: boolean; createdAt: string; handle: string | null }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const LICENSE_NAMES: Record<string, string> = { CC0: 'CC0, public domain', 'CC-BY': 'CC BY, credit the maker', 'CC-BY-NC': 'CC BY-NC, credit, no commercial use', CHOPDECK: 'Chop Deck licence, use here' };

let me: { handle: string | null } | null = null;
let q = '', tag = '', offset = 0;
const LIMIT = 30;
let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let playing: { src: AudioBufferSourceNode; stop(): void } | null = null;

async function bufferOf(hash: string): Promise<AudioBuffer | null> {
  let p = buffers.get(hash);
  if (!p) {
    p = (async () => {
      const blobs = await fetchBlobs([hash]);
      const bytes = blobs.get(hash); if (!bytes) return null;
      const s = decodeSnd(bytes); if (!s || !s.length) return null;
      ctx ??= new AudioContext();
      const buf = ctx.createBuffer(s.channels, s.length, s.rate);
      for (let ch = 0; ch < s.channels; ch++) buf.getChannelData(ch).set(s.pcm[ch] ?? s.pcm[0]);
      return buf;
    })();
    buffers.set(hash, p);
  }
  return p;
}

function drawWave(cv: HTMLCanvasElement, peaks: number[], pos: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(cv); const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814'; const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
  const n = peaks.length || 1; const bw = w / n;
  for (let i = 0; i < peaks.length; i++) { const ph = Math.max(1, peaks[i] * (h - 8)); g.fillStyle = i / n <= pos ? ink : dim; g.fillRect(i * bw + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph); }
  if (pos > 0) { g.fillStyle = ink; g.fillRect(pos * w - 1, 0, 2, h); }
}

async function toggle(s: Sample, btn: HTMLButtonElement, cv: HTMLCanvasElement, from = 0) {
  if (playing) { playing.stop(); playing = null; }
  if (btn.classList.contains('on') && from === 0) { btn.classList.remove('on'); btn.textContent = '►'; drawWave(cv, s.peaks, 0); return; }
  btn.disabled = true;
  const buf = await bufferOf(s.hash);
  btn.disabled = false;
  if (!buf || !ctx) { status('Could not fetch that sample.'); return; }
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
  const startAt = ctx.currentTime, offsetS = from * buf.duration;
  src.start(0, offsetS);
  btn.classList.add('on'); btn.textContent = '■';
  let raf = 0;
  const tick = () => { const pos = Math.min(1, (offsetS + (ctx!.currentTime - startAt)) / buf.duration); drawWave(cv, s.peaks, pos); raf = requestAnimationFrame(tick); };
  tick();
  const done = () => { cancelAnimationFrame(raf); btn.classList.remove('on'); btn.textContent = '►'; drawWave(cv, s.peaks, 0); };
  src.onended = () => { if (playing?.src === src) { playing = null; done(); } };
  playing = { src, stop: () => { try { src.stop(); } catch { /* already stopped */ } done(); } };
}

async function sendToMachine(s: Sample, btn: HTMLButtonElement) {
  btn.disabled = true; btn.textContent = 'Fetching';
  try {
    const blobs = await fetchBlobs([s.hash]);
    const bytes = blobs.get(s.hash); if (!bytes) throw new Error('no audio');
    await putHandoff({ name: `${s.title.replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase().slice(0, 16) || 'SAMPLE'}.SND`, bytes, note: `Sample "${s.title}" by @${s.handle ?? 'chopdeck'}` });
    void api(`/samples/${s.slug}/download`, { method: 'POST' });
    location.href = '/?handoff=1';
  } catch (e) { btn.disabled = false; btn.textContent = 'Send to machine'; status(`Could not fetch that sample: ${String(e)}`); }
}

function status(msg: string | null) { const el = $('status'); el.textContent = msg ?? ''; el.hidden = !msg; }

function card(s: Sample): HTMLElement {
  const el = document.createElement('article'); el.className = 'smp'; el.id = s.slug;
  const play = document.createElement('button'); play.type = 'button'; play.className = 'play'; play.textContent = '►'; play.setAttribute('aria-label', `Play ${s.title}`);
  const mid = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = s.title;
  const by = document.createElement('div'); by.className = 'by'; by.innerHTML = `by <b></b>${s.featured ? ' · featured' : ''}`; by.querySelector('b')!.textContent = s.handle ? `@${s.handle}` : 'Chop Deck';
  mid.append(h, by);
  if (s.description) { const p = document.createElement('p'); p.textContent = s.description; mid.append(p); }
  if (s.source) { const p = document.createElement('p'); p.className = 'by'; p.textContent = `Source: ${s.source}`; mid.append(p); }
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.append(...[fmtTime(s.durationMs), `${s.channels === 2 ? 'stereo' : 'mono'} ${Math.round(s.rate / 100) / 10} kHz`, fmtBytes(s.bytes), `${s.downloads} sent`, LICENSE_NAMES[s.license] ?? s.license, ...s.tags.map(t => `#${t}`)].map(t => { const x = document.createElement('span'); x.textContent = t; return x; }));
  mid.append(meta);
  const actions = document.createElement('div'); actions.className = 'actions';
  const send = document.createElement('button'); send.type = 'button'; send.className = 'send'; send.textContent = 'Send to machine'; send.onclick = () => void sendToMachine(s, send);
  actions.append(send);
  if (me?.handle && me.handle === s.handle) {
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ghost send'; rm.textContent = 'Remove';
    rm.onclick = async () => { if (!confirm(`Remove "${s.title}" from the library?`)) return; const r = await api(`/samples/${s.id}`, { method: 'DELETE' }); if (r.ok) el.remove(); else status('Could not remove that sample.'); };
    actions.append(rm);
  }
  const cv = document.createElement('canvas'); cv.className = 'wave'; cv.setAttribute('aria-label', `${s.title} waveform`);
  cv.onclick = e => { const r = cv.getBoundingClientRect(); void toggle(s, play, cv, (e.clientX - r.left) / r.width); };
  play.onclick = () => void toggle(s, play, cv);
  el.append(play, mid, actions, cv);
  requestAnimationFrame(() => drawWave(cv, s.peaks, 0));
  return el;
}

async function load(reset: boolean) {
  if (reset) { offset = 0; $('list').innerHTML = ''; }
  status(null);
  const r = await api(`/samples?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&limit=${LIMIT}&offset=${offset}`).catch(() => null);
  if (!r?.ok) { status('The library is not answering right now. Try again in a moment.'); return; }
  const d = await r.json() as { samples: Sample[] };
  for (const s of d.samples) $('list').append(card(s));
  offset += d.samples.length;
  $('none').hidden = $('list').children.length > 0;
  $('more').hidden = d.samples.length < LIMIT;
  if (reset && !tag && !q) renderTags(d.samples);
  if (location.hash) { const target = document.getElementById(location.hash.slice(1)); target?.scrollIntoView({ block: 'center' }); target?.classList.add('hit'); }
}

function renderTags(items: Sample[]) {
  const counts = new Map<string, number>();
  for (const s of items) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const box = $('tags'); box.innerHTML = '';
  for (const [t] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = `#${t}`;
    b.onclick = () => { tag = tag === t ? '' : t; box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b && !!tag)); void load(true); };
    box.append(b);
  }
}

async function main() {
  me = await api('/me').then(r => r.ok ? r.json() as Promise<{ user: { handle: string | null } }> : null).then(d => d ? d.user : null).catch(() => null);
  let t: number | null = null;
  $<HTMLInputElement>('q').addEventListener('input', e => { q = (e.target as HTMLInputElement).value.trim(); if (t) clearTimeout(t); t = window.setTimeout(() => void load(true), 250); });
  $('more').onclick = () => void load(false);
  await load(true);
}
void main();
