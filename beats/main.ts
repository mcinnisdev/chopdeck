// The beats feed: newest, most played, most liked, most remixed; by tag; by handle at /beats/<handle>/.
export {};
interface Beat { id: string; slug: string; handle: string; url: string; title: string; description: string; tags: string[]; license: string; bpm: number; durationMs: number; previewHash: string; coverHash: string | null; peaks: number[]; parent: { title: string; handle: string; url: string } | null; plays: number; likes: number; remixes: number; featured: boolean }

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const api = (path: string) => fetch(`/api${path}`, { credentials: 'same-origin' });
const fmtTime = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const LIMIT = 24;
let q = '', tag = '', sort = 'new', offset = 0;
const handle = (() => { const parts = location.pathname.split('/').filter(Boolean); return parts[0] === 'beats' && parts[1] ? parts[1] : ''; })();
const counted = new Set<string>();

function status(msg: string | null) { const el = $('status'); el.textContent = msg ?? ''; el.hidden = !msg; }

function wave(cv: HTMLCanvasElement, peaks: number[]) {
  const dpr = window.devicePixelRatio || 1; const w = cv.clientWidth || 300, h = cv.clientHeight || 90;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = getComputedStyle(cv).getPropertyValue('--lcd-ink').trim() || '#1C2814';
  const bw = w / Math.max(1, peaks.length);
  peaks.forEach((p, i) => { const ph = Math.max(1, p * (h - 12)); g.fillRect(i * bw + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph); });
}

function card(b: Beat): HTMLElement {
  const el = document.createElement('article'); el.className = 'beat';
  if (b.coverHash) { const img = document.createElement('img'); img.src = `/api/blobs/${b.coverHash}`; img.alt = ''; img.loading = 'lazy'; el.append(img); }
  else { const cv = document.createElement('canvas'); el.append(cv); requestAnimationFrame(() => wave(cv, b.peaks)); }
  const body = document.createElement('div'); body.className = 'body';
  const h = document.createElement('h3'); const a = document.createElement('a'); a.href = b.url; a.textContent = b.title; h.append(a);
  const by = document.createElement('div'); by.className = 'by';
  by.innerHTML = `by <a></a>${b.parent ? ' · remix of <a class="p"></a>' : ''}${b.featured ? ' · featured' : ''}`;
  const ha = by.querySelector('a')!; ha.href = `/beats/${b.handle}/`; ha.textContent = `@${b.handle}`;
  if (b.parent) { const pa = by.querySelector('a.p') as HTMLAnchorElement; pa.href = b.parent.url; pa.textContent = `${b.parent.title} by @${b.parent.handle}`; }
  const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = `/api/blobs/${b.previewHash}`;
  audio.addEventListener('play', () => { if (!counted.has(b.id)) { counted.add(b.id); void fetch(`/api/beats/${b.handle}/${b.slug}/play`, { method: 'POST' }); } });
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.append(...[`${b.bpm.toFixed(1)} bpm`, fmtTime(b.durationMs), `${b.plays} plays`, `${b.likes} likes`, `${b.remixes} remixes`, ...b.tags.map(t => `#${t}`)].map(t => { const s = document.createElement('span'); s.textContent = t; return s; }));
  body.append(h, by, audio, meta);
  el.append(body);
  return el;
}

async function load(reset: boolean) {
  if (reset) { offset = 0; $('grid').innerHTML = ''; }
  status(null);
  const r = await api(`/beats?q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}&sort=${sort}&handle=${encodeURIComponent(handle)}&limit=${LIMIT}&offset=${offset}`).catch(() => null);
  if (!r?.ok) { status('Beats are not answering right now. Try again in a moment.'); return; }
  const d = await r.json() as { beats: Beat[] };
  for (const b of d.beats) $('grid').append(card(b));
  offset += d.beats.length;
  $('none').hidden = $('grid').children.length > 0;
  $('more').hidden = d.beats.length < LIMIT;
  if (reset && !tag && !q) renderTags(d.beats);
}

function renderTags(items: Beat[]) {
  const counts = new Map<string, number>();
  for (const b of items) for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const box = $('tags'); box.innerHTML = '';
  for (const [t] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = `#${t}`;
    b.onclick = () => { tag = tag === t ? '' : t; box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b && !!tag)); void load(true); };
    box.append(b);
  }
}

function main() {
  if (handle) { $('heading').textContent = `Beats by @${handle}`; $('intro').textContent = `Everything @${handle} has published on Chop Deck.`; document.title = `Beats by @${handle} · Chop Deck`; }
  let t: number | null = null;
  $<HTMLInputElement>('q').addEventListener('input', e => { q = (e.target as HTMLInputElement).value.trim(); if (t) clearTimeout(t); t = window.setTimeout(() => void load(true), 250); });
  $('sorts').querySelectorAll<HTMLButtonElement>('.chip').forEach(b => { b.onclick = () => { sort = b.dataset.sort ?? 'new'; $('sorts').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); void load(true); }; });
  $('more').onclick = () => void load(false);
  void load(true);
}
main();
