// The kit library page: browse, audition pads in the page, send a kit to the machine, remove your own.
import { decodeSnd } from '@/disk/formats';
import { isKitManifest, kitPadSound, kitToPgm, type KitManifest } from '@/disk/kit';
import { fetchBlobs } from '@/disk/sync';
import { putHandoff } from '@/disk/handoff';

interface Kit { id: string; slug: string; title: string; description: string; tags: string[]; license: string; pads: string[]; sounds: number; bytes: number; downloads: number; featured: boolean; createdAt: string; handle: string | null }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const LICENSE_NAMES: Record<string, string> = { CC0: 'CC0, public domain', 'CC-BY': 'CC BY, credit the maker', 'CC-BY-NC': 'CC BY-NC, credit, no commercial use', CHOPDECK: 'Chop Deck licence, remix here' };

let me: { handle: string | null } | null = null;
let q = '', tag = '', offset = 0;
const LIMIT = 30;
const manifests = new Map<string, Promise<KitManifest>>();
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let ctx: AudioContext | null = null;

const manifestOf = (slug: string) => {
  let p = manifests.get(slug);
  if (!p) { p = api(`/kits/${slug}`).then(r => r.json()).then((d: { manifest: unknown }) => { if (!isKitManifest(d.manifest)) throw new Error('bad kit'); return d.manifest; }); manifests.set(slug, p); }
  return p;
};

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

async function audition(slug: string, pad: number, el: HTMLElement) {
  const m = await manifestOf(slug);
  const id = kitPadSound(m, pad); if (!id) return;
  const hash = m.blobs[id]; if (!hash) return;
  const snd = m.sounds.find(s => s.id === id);
  const buf = await bufferOf(hash); if (!buf || !ctx) return;
  if (ctx.state === 'suspended') await ctx.resume();
  const src = ctx.createBufferSource(); src.buffer = buf;
  const gain = ctx.createGain(); gain.gain.value = ((snd?.level ?? 100) / 100);
  src.playbackRate.value = Math.pow(2, (snd?.tune ?? 0) / 1200);
  src.connect(gain).connect(ctx.destination);
  const st = (snd?.st ?? 0) / buf.sampleRate, end = (snd?.end ?? buf.length) / buf.sampleRate;
  src.start(0, st, Math.max(0.01, end - st));
  el.classList.add('lit'); src.onended = () => el.classList.remove('lit');
}

async function sendToMachine(kit: Kit, btn: HTMLButtonElement) {
  btn.disabled = true; btn.textContent = 'Fetching sounds';
  try {
    const m = await manifestOf(kit.slug);
    const blobs = await fetchBlobs(Object.values(m.blobs));
    const bytes = kitToPgm(m, blobs);
    await putHandoff({ name: `${kit.title.replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase().slice(0, 16) || 'KIT'}.PGM`, bytes, note: `Kit "${kit.title}" by @${kit.handle ?? 'chopdeck'}` });
    void api(`/kits/${kit.slug}/download`, { method: 'POST' });
    location.href = '/?handoff=1';
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Send to machine';
    status(`Could not fetch that kit: ${String(e)}`);
  }
}

function status(msg: string | null) { const el = $('status'); el.textContent = msg ?? ''; el.hidden = !msg; }

function card(kit: Kit): HTMLElement {
  const el = document.createElement('article');
  el.className = 'kit'; el.id = kit.slug;
  const by = document.createElement('div'); by.className = 'by'; by.innerHTML = `by <b></b>${kit.featured ? ' · featured' : ''}`; by.querySelector('b')!.textContent = kit.handle ? `@${kit.handle}` : 'Chop Deck';
  const h = document.createElement('h3'); h.textContent = kit.title;
  el.append(h, by);
  if (kit.description) { const p = document.createElement('p'); p.textContent = kit.description; el.append(p); }
  const pads = document.createElement('div'); pads.className = 'pads'; pads.setAttribute('aria-label', `${kit.title} pads`);
  // the machine's pad order: 13-16 on top, 1-4 at the bottom
  for (const i of [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3]) {
    const name = kit.pads[i] ?? '';
    const b = document.createElement('button'); b.type = 'button'; b.className = `pad${name ? '' : ' empty'}`; b.textContent = name; b.title = name ? `Pad ${i + 1}: ${name}` : `Pad ${i + 1}: empty`;
    if (name) b.addEventListener('pointerdown', () => void audition(kit.slug, i, b));
    pads.append(b);
  }
  el.append(pads);
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.append(...[`${kit.sounds} sounds`, fmtBytes(kit.bytes), `${kit.downloads} sent`, LICENSE_NAMES[kit.license] ?? kit.license, ...kit.tags.map(t => `#${t}`)].map(t => { const s = document.createElement('span'); s.textContent = t; return s; }));
  el.append(meta);
  const row = document.createElement('div'); row.className = 'row';
  const send = document.createElement('button'); send.type = 'button'; send.textContent = 'Send to machine'; send.onclick = () => void sendToMachine(kit, send);
  row.append(send);
  if (me?.handle && me.handle === kit.handle) {
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'ghost'; rm.textContent = 'Remove';
    rm.onclick = async () => { if (!confirm(`Remove "${kit.title}" from the library?`)) return; const r = await api(`/kits/${kit.id}`, { method: 'DELETE' }); if (r.ok) el.remove(); else status('Could not remove that kit.'); };
    row.append(rm);
  }
  el.append(row);
  return el;
}

async function load(reset: boolean) {
  if (reset) { offset = 0; $('grid').innerHTML = ''; }
  status(null);
  const r = await api(`/kits?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&limit=${LIMIT}&offset=${offset}`).catch(() => null);
  if (!r?.ok) { status('The library is not answering right now. Try again in a moment.'); return; }
  const d = await r.json() as { kits: Kit[] };
  for (const k of d.kits) $('grid').append(card(k));
  offset += d.kits.length;
  $('none').hidden = $('grid').children.length > 0;
  $('more').hidden = d.kits.length < LIMIT;
  if (reset && !tag && !q) renderTags(d.kits);
  if (location.hash) { const target = document.getElementById(location.hash.slice(1)); target?.scrollIntoView({ block: 'center' }); target?.classList.add('hit'); }
}

function renderTags(kits: Kit[]) {
  const counts = new Map<string, number>();
  for (const k of kits) for (const t of k.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
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
