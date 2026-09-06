// Publish a sound as a sample: one of the machine's sounds (from its autosave) or a file decoded here.
import { loadAutosave } from '@/disk/autosave';
import { soundBlob } from '@/disk/manifest';
import { decodeFileToSound, durationMs, peaksOf } from '@/disk/sample';
import type { Sound } from '@/model/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const error = (msg: string | null) => { const el = $('error'); el.textContent = msg ?? ''; el.hidden = !msg; };
const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let chosen: Sound | null = null;
let ctx: AudioContext | null = null;

function drawWave(cv: HTMLCanvasElement, peaks: number[]) {
  const dpr = window.devicePixelRatio || 1; const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(cv).getPropertyValue('--lcd-ink').trim() || '#1C2814';
  const bw = w / Math.max(1, peaks.length);
  peaks.forEach((p, i) => { const ph = Math.max(1, p * (h - 8)); g.fillRect(i * bw + 0.5, (h - ph) / 2, Math.max(1, bw - 1), ph); });
}

function choose(s: Sound, el?: HTMLElement) {
  chosen = s;
  document.querySelectorAll('.src').forEach(p => p.classList.toggle('on', p === el));
  $<HTMLInputElement>('title').value = s.name.trim();
  const cv = $<HTMLCanvasElement>('wave'); cv.hidden = false; drawWave(cv, peaksOf(s.pcm));
  error(null);
}

async function main() {
  const me = await api('/me').then(r => r.ok ? r.json() as Promise<{ user: { handle: string | null } }> : null).catch(() => null);
  show('loading', false);
  if (!me) { show('signed-out'); return; }
  if (!me.user.handle) { show('no-handle'); return; }
  show('form-box');
  const machine = await loadAutosave();
  const box = $('sources');
  for (const s of machine?.sounds ?? []) {
    if (!s.length) continue;
    const el = document.createElement('div'); el.className = 'src'; el.setAttribute('role', 'radio');
    el.innerHTML = `<b></b><span></span><span class="len"></span>`;
    el.querySelector('b')!.textContent = s.name; (el.children[1] as HTMLElement).textContent = `${s.channels === 2 ? 'stereo' : 'mono'} ${Math.round(s.rate / 100) / 10} kHz`; (el.children[2] as HTMLElement).textContent = fmtTime(durationMs(s));
    el.onclick = () => choose(s, el);
    box.append(el);
  }
  const drop = $('drop'); const input = $<HTMLInputElement>('file');
  drop.onclick = () => input.click();
  input.onchange = () => { if (input.files?.[0]) void fromFile(input.files[0]); };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files[0]; if (f) void fromFile(f); };
  $<HTMLFormElement>('form').onsubmit = e => { e.preventDefault(); void publish(); };
  void loadMine();
}

async function fromFile(file: File) {
  error(null);
  try { ctx ??= new AudioContext(); choose(await decodeFileToSound(file, ctx)); }
  catch (e) { error(`Could not read that file: ${e instanceof Error ? e.message : String(e)}`); }
}

async function publish() {
  if (!chosen) { error('Choose a sound first.'); return; }
  const btn = $<HTMLButtonElement>('publish'); const prog = $('progress');
  btn.disabled = true; error(null); show('done', false);
  try {
    prog.textContent = 'Packing';
    const { hash, bytes } = await soundBlob(chosen);
    const head = await api(`/blobs/${hash}`, { method: 'HEAD' });
    if (head.status === 404) {
      prog.textContent = `Uploading ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`;
      const up = await api(`/blobs/${hash}`, { method: 'POST', body: bytes as BodyInit, headers: { 'content-type': 'application/zip' } });
      if (up.status === 507) throw new Error('your cloud storage is full');
      if (up.status === 413) throw new Error('that sound is too large');
      if (!up.ok) throw new Error(`upload failed (${up.status})`);
    }
    prog.textContent = 'Publishing';
    const r = await api('/samples', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      hash, title: $<HTMLInputElement>('title').value, description: $<HTMLTextAreaElement>('description').value, source: $<HTMLInputElement>('source').value,
      tags: $<HTMLInputElement>('tags').value.split(',').map(t => t.trim()).filter(Boolean), license: $<HTMLSelectElement>('license').value,
      durationMs: durationMs(chosen), rate: chosen.rate, channels: chosen.channels, peaks: peaksOf(chosen.pcm), rights: $<HTMLInputElement>('rights').checked,
    }) });
    const d = await r.json() as { url?: string; error?: string };
    if (!r.ok) throw new Error(d.error ?? `publish failed (${r.status})`);
    $<HTMLAnchorElement>('done-link').href = d.url ?? '/samples/';
    show('done');
    void loadMine();
  } catch (e) { error(e instanceof Error ? e.message : String(e)); }
  prog.textContent = ''; btn.disabled = false;
}

async function loadMine() {
  const d = await api('/samples/mine').then(r => r.ok ? r.json() as Promise<{ samples: { id: string; slug: string; title: string; durationMs: number; downloads: number }[] }> : null).catch(() => null);
  if (!d?.samples.length) return;
  show('mine-box');
  const table = $<HTMLTableElement>('mine');
  for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) row.remove();
  for (const s of d.samples) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><a></a></td><td>${fmtTime(s.durationMs)}</td><td>${s.downloads}</td><td><button type="button" class="ghost">Remove</button></td>`;
    const a = tr.querySelector('a')!; a.href = `/samples/#${s.slug}`; a.textContent = s.title;
    tr.querySelector('button')!.onclick = async () => { if (!confirm(`Remove "${s.title}" from the library?`)) return; const r = await api(`/samples/${s.id}`, { method: 'DELETE' }); if (r.ok) tr.remove(); };
    table.append(tr);
  }
}

void main();
