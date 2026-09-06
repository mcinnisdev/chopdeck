// Publish one of the machine's programs as a kit. Reads the same autosave the machine writes.
import { loadAutosave } from '@/disk/autosave';
import { buildKit, padNames, programSounds } from '@/disk/kit';
import type { Machine } from '@/model/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const error = (msg: string | null) => { const el = $('error'); el.textContent = msg ?? ''; el.hidden = !msg; };

let machine: Machine | null = null;
let chosen = -1;

async function main() {
  const me = await api('/me').then(r => r.ok ? r.json() as Promise<{ user: { handle: string | null } }> : null).catch(() => null);
  show('loading', false);
  if (!me) { show('signed-out'); return; }
  if (!me.user.handle) { show('no-handle'); return; }
  machine = await loadAutosave();
  const programs = machine ? machine.programs.map((p, i) => ({ p, i })).filter(x => programSounds(machine!, x.p).length > 0) : [];
  if (!programs.length) { show('no-programs'); void loadMine(); return; }
  show('form-box');
  const want = Number(new URLSearchParams(location.search).get('pgm') ?? -1);
  const box = $('programs');
  for (const { p, i } of programs) {
    const el = document.createElement('div'); el.className = 'program'; el.setAttribute('role', 'radio');
    const names = padNames(machine!, p).filter(Boolean);
    el.innerHTML = `<b></b><span></span><span class="pads"></span>`;
    el.querySelector('b')!.textContent = `${i + 1}`; (el.children[1] as HTMLElement).textContent = `${p.name.trim() || 'untitled'} · ${programSounds(machine!, p).length} sounds`;
    (el.children[2] as HTMLElement).textContent = names.join(' · ');
    el.onclick = () => choose(i, el);
    box.append(el);
    if (i === want || (chosen < 0 && want < 0)) choose(i, el);
  }
  if (chosen < 0) choose(programs[0].i, box.firstElementChild as HTMLElement);
  $<HTMLFormElement>('form').onsubmit = e => { e.preventDefault(); void publish(); };
  void loadMine();
}

function choose(i: number, el: HTMLElement) {
  chosen = i;
  document.querySelectorAll('.program').forEach(p => p.classList.toggle('on', p === el));
  $<HTMLInputElement>('title').value = machine!.programs[i].name.trim();
}

async function publish() {
  if (!machine || chosen < 0) return;
  const btn = $<HTMLButtonElement>('publish'); const prog = $('progress');
  btn.disabled = true; error(null); show('done', false);
  try {
    prog.textContent = 'Packing sounds';
    const { manifest, blobs, pads } = await buildKit(machine, machine.programs[chosen]);
    const hashes = Array.from(blobs.keys());
    let n = 0;
    for (const h of hashes) {
      prog.textContent = `Uploading ${++n} of ${hashes.length}`;
      const head = await api(`/blobs/${h}`, { method: 'HEAD' });
      if (head.status === 404) {
        const up = await api(`/blobs/${h}`, { method: 'POST', body: blobs.get(h)! as BodyInit, headers: { 'content-type': 'application/zip' } });
        if (up.status === 507) throw new Error('your cloud storage is full');
        if (!up.ok) throw new Error(`upload failed (${up.status})`);
      }
    }
    prog.textContent = 'Publishing';
    const r = await api('/kits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      manifest, hashes, pads,
      title: $<HTMLInputElement>('title').value, description: $<HTMLTextAreaElement>('description').value,
      tags: $<HTMLInputElement>('tags').value.split(',').map(t => t.trim()).filter(Boolean), license: $<HTMLSelectElement>('license').value,
    }) });
    const d = await r.json() as { slug?: string; url?: string; error?: string };
    if (!r.ok) throw new Error(d.error ?? `publish failed (${r.status})`);
    $<HTMLAnchorElement>('done-link').href = d.url ?? '/kits/';
    show('done');
    void loadMine();
  } catch (e) { error(String(e instanceof Error ? e.message : e)); }
  prog.textContent = ''; btn.disabled = false;
}

async function loadMine() {
  const d = await api('/kits/mine').then(r => r.ok ? r.json() as Promise<{ kits: { id: string; slug: string; title: string; sounds: number; downloads: number }[] }> : null).catch(() => null);
  if (!d?.kits.length) return;
  show('mine-box');
  const table = $<HTMLTableElement>('mine');
  for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) row.remove();
  for (const k of d.kits) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><a></a></td><td>${k.sounds}</td><td>${k.downloads}</td><td><button type="button" class="ghost">Remove</button></td>`;
    const a = tr.querySelector('a')!; a.href = `/kits/#${k.slug}`; a.textContent = k.title;
    tr.querySelector('button')!.onclick = async () => { if (!confirm(`Remove "${k.title}" from the library?`)) return; const r = await api(`/kits/${k.id}`, { method: 'DELETE' }); if (r.ok) tr.remove(); };
    table.append(tr);
  }
}

void main();
