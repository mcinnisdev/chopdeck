// One beat's page: player over the waveform, likes, open on the machine, remix, download, lineage.
// Served at /beats/<handle>/<slug> by a Pages Function that fills in the share tags.
import { isManifest } from '@/disk/manifest';
import { fetchBlobs } from '@/disk/sync';
import { putHandoff } from '@/disk/handoff';
import { beatToProjectFile } from '@/disk/beat';
import { setRemixOf } from '@/disk/remix';

interface Beat { id: string; slug: string; handle: string; url: string; title: string; description: string; tags: string[]; license: string; bpm: number; durationMs: number; previewHash: string; coverHash: string | null; peaks: number[]; parent: { title: string; handle: string; url: string } | null; plays: number; likes: number; remixes: number; liked: boolean; remixList: Beat[] }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const fmtTime = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const LICENSE_NAMES: Record<string, string> = { PD: 'Public domain', CC0: 'CC0', 'CC-BY': 'CC BY', 'CC-BY-NC': 'CC BY-NC', CHOPDECK: 'Chop Deck licence' };
const status = (msg: string | null) => { const el = $('status'); el.textContent = msg ?? ''; el.hidden = !msg; };

const [, , handle, slug] = location.pathname.split('/');
let beat: Beat | null = null;
let audio: HTMLAudioElement | null = null;
let counted = false;

function drawWave(pos: number) {
  const cv = $<HTMLCanvasElement>('wave'); const peaks = beat?.peaks ?? [];
  const dpr = window.devicePixelRatio || 1; const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const cs = getComputedStyle(cv); const ink = cs.getPropertyValue('--lcd-ink').trim() || '#1C2814'; const dim = cs.getPropertyValue('--lcd-dim').trim() || '#5C6B44';
  const n = peaks.length || 1; const bw = w / n;
  peaks.forEach((p, i) => { const ph = Math.max(1, p * (h - 10)); g.fillStyle = i / n <= pos ? ink : dim; g.fillRect(i * bw + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph); });
  if (pos > 0) { g.fillStyle = ink; g.fillRect(pos * w - 1, 0, 2, h); }
}

function player() {
  audio = new Audio(`/api/blobs/${beat!.previewHash}`);
  audio.preload = 'metadata';
  const btn = $<HTMLButtonElement>('play');
  const tick = () => { if (!audio) return; const d = audio.duration || beat!.durationMs / 1000; $('pos').textContent = fmtTime(audio.currentTime * 1000); drawWave(d ? audio.currentTime / d : 0); };
  audio.addEventListener('timeupdate', tick);
  audio.addEventListener('play', () => { btn.classList.add('on'); btn.textContent = '■'; if (!counted) { counted = true; void api(`/beats/${handle}/${slug}/play`, { method: 'POST' }); } });
  audio.addEventListener('pause', () => { btn.classList.remove('on'); btn.textContent = '►'; });
  audio.addEventListener('ended', () => { btn.classList.remove('on'); btn.textContent = '►'; drawWave(0); });
  btn.onclick = () => { if (!audio) return; if (audio.paused) void audio.play(); else audio.pause(); };
  $<HTMLCanvasElement>('wave').onclick = e => { if (!audio) return; const r = (e.target as HTMLElement).getBoundingClientRect(); const d = audio.duration || beat!.durationMs / 1000; audio.currentTime = ((e.clientX - r.left) / r.width) * d; if (audio.paused) void audio.play(); };
  $('len').textContent = fmtTime(beat!.durationMs);
  drawWave(0);
}

async function toMachine(remix: boolean, btn: HTMLButtonElement) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Fetching the project';
  try {
    const d = await api(`/beats/${handle}/${slug}/manifest`).then(r => r.json() as Promise<{ id: string; manifest: unknown }>);
    if (!isManifest(d.manifest)) throw new Error('bad project');
    const blobs = await fetchBlobs(Object.values(d.manifest.blobs));
    const bytes = beatToProjectFile(d.manifest, blobs);
    await putHandoff({ name: `${beat!.title.replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase().slice(0, 16) || 'BEAT'}.CHOPDECK`, bytes, note: `Beat "${beat!.title}" by @${beat!.handle}`, setAside: true });
    setRemixOf(remix ? beat!.id : null);
    location.href = '/?handoff=1';
  } catch (e) { btn.disabled = false; btn.textContent = label; status(`Could not fetch that beat: ${String(e)}`); }
}

async function download() {
  const d = await api(`/beats/${handle}/${slug}/manifest`).then(r => r.json() as Promise<{ manifest: unknown }>);
  if (!isManifest(d.manifest)) return;
  const blobs = await fetchBlobs(Object.values(d.manifest.blobs));
  const bytes = beatToProjectFile(d.manifest, blobs);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a'); a.href = url; a.download = `${beat!.title.replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase()}.CHOPDECK`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function main() {
  const r = await api(`/beats/${handle}/${slug}`).catch(() => null);
  show('loading', false);
  if (!r?.ok) { show('missing'); return; }
  beat = await r.json() as Beat;
  const me = await api('/me').then(x => x.ok ? x.json() as Promise<{ user: { handle: string | null } }> : null).catch(() => null);
  document.title = `${beat.title} by @${beat.handle} · Chop Deck`;
  show('beat');
  if (beat.coverHash) { const img = $<HTMLImageElement>('cover'); img.src = `/api/blobs/${beat.coverHash}`; img.alt = `${beat.title} share card`; img.hidden = false; }
  $('title').textContent = beat.title;
  const h = $<HTMLAnchorElement>('handle'); h.textContent = `@${beat.handle}`; h.href = `/beats/${beat.handle}/`;
  if (beat.parent) { const l = $('lineage'); l.innerHTML = ' · remix of <a></a>'; const a = l.querySelector('a')!; a.textContent = `${beat.parent.title} by @${beat.parent.handle}`; a.href = beat.parent.url; }
  $('description').textContent = beat.description;
  $('stats').textContent = `${beat.plays} plays · ${beat.likes} likes · ${beat.remixes} remixes`;
  const meta = $('meta');
  meta.append(...[`${beat.bpm.toFixed(1)} bpm`, fmtTime(beat.durationMs), LICENSE_NAMES[beat.license] ?? beat.license, ...beat.tags.map(t => `#${t}`)].map(t => { const s = document.createElement('span'); s.textContent = t; return s; }));
  player();
  $<HTMLButtonElement>('open').onclick = e => void toMachine(false, e.currentTarget as HTMLButtonElement);
  $<HTMLButtonElement>('remix').onclick = e => void toMachine(true, e.currentTarget as HTMLButtonElement);
  const like = $<HTMLButtonElement>('like');
  like.classList.toggle('on', beat.liked); like.textContent = `♥ ${beat.likes}`;
  like.onclick = async () => {
    if (!me) { status('Sign in to like beats.'); return; }
    const res = await api(`/beats/${handle}/${slug}/like`, { method: 'POST' });
    if (!res.ok) return;
    const d = await res.json() as { liked: boolean; likes: number };
    like.classList.toggle('on', d.liked); like.textContent = `♥ ${d.likes}`;
  };
  if (beat.license !== 'CHOPDECK') { show('download'); $('download').onclick = () => void download(); }
  if (me?.user.handle === beat.handle) {
    show('remove');
    $('remove').onclick = async () => { if (!confirm(`Remove "${beat!.title}"?`)) return; const res = await api(`/beats/${beat!.id}`, { method: 'DELETE' }); if (res.ok) location.href = '/beats/'; };
  }
  if (beat.remixList.length) {
    show('remixes-box');
    for (const rmx of beat.remixList) { const a = document.createElement('a'); a.href = rmx.url; a.textContent = `${rmx.title} by @${rmx.handle}`; $('remixes').append(a); }
  }
  window.addEventListener('resize', () => drawWave(audio && audio.duration ? audio.currentTime / audio.duration : 0));
}
void main();
