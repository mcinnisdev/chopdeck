// The account page: sign in, handle, usage, the synced project and its revisions, export, delete.
// Talks to /api; shares nothing with the machine except the origin and the sync mark in localStorage.
import { encodeProject } from '@/disk/formats';
import { isManifest, machineFromManifest } from '@/disk/manifest';
import { fetchBlobs } from '@/disk/sync';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const api = (path: string, init?: RequestInit) => fetch(`/api${path}`, { credentials: 'same-origin', ...init });
const post = (path: string, body: unknown) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fmtBytes = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : n < 1024 * 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
const fmtDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString(); };
const error = (id: string, msg: string | null) => { const el = $(id); el.textContent = msg ?? ''; el.hidden = !msg; };
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

interface Me { user: { id: string; email: string; handle: string | null; plan: string }; usage: { bytes: number; quota: number }; project: { title: string; revision: number; updatedAt: string } | null }

async function main() {
  const r = await api('/me').catch(() => null);
  if (!r || r.status === 401) { await signedOut(); return; }
  if (!r.ok) { show('loading', false); show('signed-out'); error('signin-error', `The account service answered ${r.status}. Try again in a moment.`); return; }
  signedIn(await r.json() as Me);
}

async function signedOut() {
  show('loading', false); show('signed-out');
  const p = await api('/providers').then(x => x.ok ? x.json() as Promise<{ google: boolean; github: boolean }> : null).catch(() => null);
  if (p?.google) show('google');
  if (p?.github) show('github');
  $<HTMLFormElement>('magic').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $<HTMLInputElement>('email').value.trim();
    error('signin-error', null);
    const res = await post('/auth/sign-in/magic-link', { email, callbackURL: '/account/' });
    if (!res.ok) { error('signin-error', 'Could not send the link. Check the address and try again.'); return; }
    show('sent');
    if (isLocal) {
      const d = await api(`/dev/magic-link?email=${encodeURIComponent(email)}`).then(x => x.ok ? x.json() as Promise<{ url: string }> : null).catch(() => null);
      if (d?.url) { $<HTMLAnchorElement>('devlink-a').href = d.url; show('devlink'); }
    }
  });
  for (const provider of ['google', 'github'] as const) {
    $(provider).addEventListener('click', async () => {
      const res = await post('/auth/sign-in/social', { provider, callbackURL: '/account/' });
      const d = res.ok ? await res.json() as { url?: string } : null;
      if (d?.url) location.href = d.url; else error('signin-error', `${provider} sign-in is not available right now.`);
    });
  }
}

function signedIn(me: Me) {
  show('loading', false); show('signed-in');
  $('email-out').textContent = me.user.email;
  $('handle-out').textContent = me.user.handle ? `@${me.user.handle}` : 'none yet';
  $('plan-out').textContent = me.user.plan === 'free' ? 'Free' : me.user.plan;
  $('usage-out').textContent = `${fmtBytes(me.usage.bytes)} of ${fmtBytes(me.usage.quota)}`;
  $('usage-bar').style.width = `${Math.min(100, (me.usage.bytes / me.usage.quota) * 100).toFixed(1)}%`;
  show('handle-box', !me.user.handle);
  $('change-handle').onclick = () => { show('handle-box'); $<HTMLInputElement>('handle').focus(); };
  $<HTMLFormElement>('handle-form').onsubmit = async e => {
    e.preventDefault();
    error('account-error', null);
    const res = await api('/me', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ handle: $<HTMLInputElement>('handle').value }) });
    const d = await res.json() as { handle?: string; error?: string };
    if (!res.ok) { error('account-error', d.error ?? 'Could not save the handle.'); return; }
    $('handle-out').textContent = `@${d.handle}`; show('handle-box', false);
  };

  if (!me.project) { show('no-project'); } else {
    show('project-box');
    $('project-line').textContent = `${me.project.title || 'Untitled'}  v${me.project.revision}  ${fmtDate(me.project.updatedAt)}`;
    void loadRevisions();
    $('export').onclick = () => void exportProject();
  }

  $('signout').onclick = async () => {
    await post('/auth/sign-out', {});
    try { localStorage.removeItem('chopdeck.sync'); } catch { /* private mode */ }
    location.reload();
  };
  $('delete').onclick = async () => {
    if (!confirm('Delete your account, your synced project and its versions? This cannot be undone.')) return;
    const res = await api('/me', { method: 'DELETE' });
    if (!res.ok) { error('account-error', 'Could not delete the account.'); return; }
    try { localStorage.removeItem('chopdeck.sync'); } catch { /* private mode */ }
    location.href = '/';
  };
}

async function loadRevisions() {
  const d = await api('/project/revisions').then(x => x.json() as Promise<{ current: { revision: number; title: string; updatedAt: string } | null; revisions: { revision: number; title: string; createdAt: string }[] }>);
  const table = $<HTMLTableElement>('revs');
  for (const row of Array.from(table.querySelectorAll('tr')).slice(1)) row.remove();
  const rows = [...(d.current ? [{ revision: d.current.revision, title: d.current.title, createdAt: d.current.updatedAt, current: true }] : []), ...d.revisions.map(r => ({ ...r, current: false }))];
  for (const rv of rows) {
    const tr = document.createElement('tr');
    const restore = rv.current ? '<em>current</em>' : `<button type="button" class="ghost" data-restore="${rv.revision}">Restore</button>`;
    tr.innerHTML = `<td>v${rv.revision}</td><td></td><td>${fmtDate(rv.createdAt)}</td><td>${restore}</td>`;
    tr.children[1].textContent = rv.title || 'Untitled';
    table.appendChild(tr);
  }
  table.querySelectorAll<HTMLButtonElement>('button[data-restore]').forEach(b => {
    b.onclick = async () => {
      b.disabled = true;
      const res = await post(`/project/restore/${b.dataset.restore}`, {});
      if (!res.ok) { error('account-error', 'Could not restore that version.'); b.disabled = false; return; }
      // make the machine pull this version the next time it powers on
      try { localStorage.setItem('chopdeck.sync', JSON.stringify({ revision: 0, pushedAt: '' })); } catch { /* private mode */ }
      location.reload();
    };
  });
}

/** Everything in the account as one .CHOPDECK file, built here from the manifest and its blobs. */
async function exportProject() {
  const btn = $<HTMLButtonElement>('export');
  btn.disabled = true; btn.textContent = 'Gathering sounds';
  try {
    const p = await api('/project').then(x => x.json() as Promise<{ manifest: unknown; title: string }>);
    if (!isManifest(p.manifest)) throw new Error('bad manifest');
    const blobs = await fetchBlobs(Object.values(p.manifest.blobs));
    const { machine, masterTempo } = machineFromManifest(p.manifest, blobs);
    const bytes = encodeProject(machine, masterTempo);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${(p.title || 'CHOPDECK').replace(/[^A-Za-z0-9_-]+/g, '_').toUpperCase()}.CHOPDECK`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) { error('account-error', `Export failed: ${String(e)}`); }
  btn.disabled = false; btn.textContent = 'Download as .CHOPDECK';
}

void main();
