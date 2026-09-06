// Publish a beat: pick a sequence or song from the machine's autosave, render the preview with the
// machine's engine, draw the share card, upload what the server lacks, publish under your handle.
import { loadAutosave } from '@/disk/autosave';
import { buildManifest } from '@/disk/manifest';
import { renderBeat, drawBeatCard, canvasPng, type BeatSource } from '@/disk/beat';
import { getRemixOf, setRemixOf } from '@/disk/remix';
import { padNames } from '@/disk/kit';
import { sha256 } from '@/disk/manifest';
import type { Machine } from '@/model/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const error = (msg: string | null) => { const el = $('error'); el.textContent = msg ?? ''; el.hidden = !msg; };

let machine: Machine | null = null;
let masterTempo = 120;
let handle = '';
let chosen: BeatSource | null = null;
let parent: { id: string; title: string; url: string } | null = null;

const noteCount = (m: Machine, i: number) => m.sequences[i].tracks.reduce((a, t) => a + (t.events?.length ?? 0), 0);

async function main() {
  const me = await api('/me').then(r => r.ok ? r.json() as Promise<{ user: { handle: string | null } }> : null).catch(() => null);
  show('loading', false);
  if (!me) { show('signed-out'); return; }
  if (!me.user.handle) { show('no-handle'); return; }
  handle = me.user.handle;
  machine = await loadAutosave();
  const proj = await api('/project').then(r => r.ok ? r.json() as Promise<{ manifest: { masterTempo?: number } }> : null).catch(() => null);
  masterTempo = proj?.manifest.masterTempo ?? 120;
  const seqs = machine ? machine.sequences.map((q, i) => ({ q, i })).filter(x => noteCount(machine!, x.i) > 0) : [];
  const songs = machine ? machine.songs.map((s, i) => ({ s, i })).filter(x => x.s.used && x.s.steps.length > 0) : [];
  if (!seqs.length && !songs.length) { show('nothing'); void loadMine(); return; }
  show('form-box');
  const box = $('sources');
  const add = (label: string, name: string, detail: string, src: BeatSource) => {
    const el = document.createElement('div'); el.className = 'src'; el.setAttribute('role', 'radio');
    el.innerHTML = `<b></b><span></span><span class="len"></span>`;
    el.querySelector('b')!.textContent = label; (el.children[1] as HTMLElement).textContent = name; (el.children[2] as HTMLElement).textContent = detail;
    el.onclick = () => { chosen = src; document.querySelectorAll('.src').forEach(p => p.classList.toggle('on', p === el)); $<HTMLInputElement>('title').value = name; };
    box.append(el);
    if (!chosen) el.click();
  };
  for (const { q, i } of seqs) add(`Seq ${String(i + 1).padStart(2, '0')}`, q.name.trim() || 'untitled', `${q.bars} bars · ${noteCount(machine!, i)} notes · ${(q.tempoSource === 'MAS' ? masterTempo : q.tempo).toFixed(1)} bpm`, { kind: 'sequence', index: i });
  for (const { s, i } of songs) add(`Song ${String(i + 1).padStart(2, '0')}`, s.name.trim() || 'untitled', `${s.steps.length} steps`, { kind: 'song', index: i });

  const remixOf = getRemixOf();
  if (remixOf) {
    parent = await lookupBeat(remixOf);
    if (parent) { $<HTMLAnchorElement>('remix-link').href = parent.url; $('remix-link').textContent = parent.title; show('remix-box'); } else setRemixOf(null);
  }
  $<HTMLFormElement>('form').onsubmit = e => { e.preventDefault(); void publish(); };
  void loadMine();
}

async function lookupBeat(id: string): Promise<{ id: string; title: string; url: string } | null> {
  const r = await api(`/beats/by-id/${id}`).catch(() => null);
  if (!r?.ok) return null;
  const d = await r.json() as { id: string; title: string; url: string };
  return { id: d.id, title: d.title, url: d.url };
}

async function upload(hash: string, bytes: Uint8Array, mime: string) {
  const head = await api(`/blobs/${hash}`, { method: 'HEAD' });
  if (head.status === 200) return;
  const up = await api(`/blobs/${hash}`, { method: 'POST', body: bytes as BodyInit, headers: { 'content-type': mime } });
  if (up.status === 507) throw new Error('your cloud storage is full');
  if (!up.ok) throw new Error(`upload failed (${up.status})`);
}

async function publish() {
  if (!machine || !chosen) return;
  const btn = $<HTMLButtonElement>('publish'); const prog = $('progress');
  btn.disabled = true; error(null); show('done', false);
  try {
    const title = $<HTMLInputElement>('title').value.trim();
    const step = (s: string) => { prog.textContent = s; };
    const { mp3, durationMs, peaks, bpm } = await renderBeat(machine, chosen, masterTempo, 0, step);
    const audio = $<HTMLAudioElement>('preview'); audio.src = URL.createObjectURL(new Blob([mp3 as BlobPart], { type: 'audio/mpeg' })); audio.hidden = false;
    step('Drawing the card');
    const cv = $<HTMLCanvasElement>('card');
    drawBeatCard(cv, { title, handle, peaks, pads: padNames(machine, machine.programs[machine.drums[0].pgm]), bpm });
    cv.hidden = false;
    const png = await canvasPng(cv);
    step('Packing sounds');
    const { manifest, blobs } = await buildManifest(machine, masterTempo);
    const previewHash = await sha256(mp3), coverHash = await sha256(png);
    let n = 0;
    for (const [h, bytes] of blobs) { step(`Uploading sounds ${++n} of ${blobs.size}`); await upload(h, bytes, 'application/zip'); }
    step('Uploading preview'); await upload(previewHash, mp3, 'audio/mpeg');
    step('Uploading card'); await upload(coverHash, png, 'image/png');
    step('Publishing');
    const keepLineage = parent && $<HTMLInputElement>('keep-lineage').checked;
    const r = await api('/beats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      manifest, previewHash, coverHash, title, description: $<HTMLTextAreaElement>('description').value,
      tags: $<HTMLInputElement>('tags').value.split(',').map(t => t.trim()).filter(Boolean), license: $<HTMLSelectElement>('license').value,
      source: chosen, bpm, durationMs, peaks, parentBeat: keepLineage ? parent!.id : null,
    }) });
    const d = await r.json() as { url?: string; error?: string; blocked?: string[] };
    if (!r.ok) throw new Error(d.blocked?.length ? `${d.error}: ${d.blocked.join(', ')}` : d.error ?? `publish failed (${r.status})`);
    setRemixOf(null); show('remix-box', false);
    $<HTMLAnchorElement>('done-link').href = d.url ?? '/beats/';
    show('done');
    void loadMine();
  } catch (e) { error(e instanceof Error ? e.message : String(e)); }
  prog.textContent = ''; btn.disabled = false;
}

async function loadMine() {
  const d = await api('/beats/mine').then(r => r.ok ? r.json() as Promise<{ beats: { id: string; url: string; title: string; plays: number; likes: number; remixes: number }[] }> : null).catch(() => null);
  if (!d?.beats.length) return;
  show('mine-box');
  const table = $<HTMLTableElement>('mine');
  for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) row.remove();
  for (const b of d.beats) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><a></a></td><td>${b.plays}</td><td>${b.likes}</td><td>${b.remixes}</td><td><button type="button" class="ghost">Remove</button></td>`;
    const a = tr.querySelector('a')!; a.href = b.url; a.textContent = b.title;
    tr.querySelector('button')!.onclick = async () => { if (!confirm(`Remove "${b.title}"?`)) return; const r = await api(`/beats/${b.id}`, { method: 'DELETE' }); if (r.ok) tr.remove(); };
    table.append(tr);
  }
}

void main();
