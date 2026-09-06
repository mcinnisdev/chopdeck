// The Chop Deck API: auth, the signed-in user's project (the machine's whole state as a manifest that
// references sounds by hash), content-addressed sound blobs, and revisions. Runs as a Cloudflare Pages
// Function at /api/*; see functions/api/[[route]].ts. Tested against Miniflare in app.test.ts.
import { Hono } from 'hono';
import { makeAuth, sessionUser, type SessionUser } from './auth';
import { kits } from './kits';
import { samples } from './samples';
import { admin } from './admin';
import { sha256Hex } from './hash';
import { MAX_BLOB_BYTES, PLAN_QUOTA_BYTES, REVISIONS_KEPT, type Env } from './env';

type Vars = { user: SessionUser };
export const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;
const RESERVED = new Set(['admin', 'chopdeck', 'chop-deck', 'support', 'help', 'api', 'www', 'root', 'staff', 'official', 'akai', 'mpc', 'beats', 'kits', 'samples', 'account', 'manual', 'publish', 'terms', 'privacy', 'dmca']);

export function quotaFor(plan: string): number { return PLAN_QUOTA_BYTES[plan] ?? PLAN_QUOTA_BYTES.free; }

export { sha256Hex };

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

async function usageBytes(env: Env, userId: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(bytes), 0) AS b FROM blobs WHERE uploader_id = ?').bind(userId).first<{ b: number }>();
  return r?.b ?? 0;
}

// ---------- public ----------
app.get('/health', c => c.json({ ok: true }));

app.on(['GET', 'POST'], '/auth/*', c => makeAuth(c.env).handler(c.req.raw));

/** Which sign-in buttons the account page should show. */
app.get('/providers', c => c.json({ google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET), github: !!(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET) }));

/** Development only: the last magic link sent to an address. Never enabled in production. */
app.get('/dev/magic-link', async c => {
  if (c.env.DEV_MAGIC_LINKS !== '1') return c.notFound();
  const email = c.req.query('email') ?? '';
  const r = await c.env.DB.prepare('SELECT url FROM dev_links WHERE email = ? ORDER BY rowid DESC LIMIT 1').bind(email).first<{ url: string }>();
  return r ? c.json({ url: r.url }) : c.json({ error: 'no link' }, 404);
});

// ---------- session ----------
// Public routes (browsing kits, fetching public blobs) still learn who is asking, if anyone; the
// rest refuse without a session.
const PUBLIC = (c: { req: { path: string; method: string } }) => {
  const p = c.req.path, m = c.req.method;
  if (p.startsWith('/api/auth/') || p === '/api/health' || p === '/api/providers' || p.startsWith('/api/dev/')) return true;
  if ((p.startsWith('/api/kits') || p.startsWith('/api/samples')) && (m === 'GET' || p.endsWith('/download'))) return true;
  if (p.startsWith('/api/blobs/') && m === 'GET') return true;
  return false;
};
app.use('/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth/') || c.req.path === '/api/health' || c.req.path.startsWith('/api/admin/')) return next();
  const user = await sessionUser(makeAuth(c.env), c.req.raw);
  if (user) c.set('user', user);
  else if (!PUBLIC(c)) return c.json({ error: 'sign in first' }, 401);
  await next();
});

app.route('/kits', kits);
app.route('/samples', samples);
app.route('/admin', admin);

app.get('/me', async c => {
  const u = c.get('user');
  const [used, project] = await Promise.all([
    usageBytes(c.env, u.id),
    c.env.DB.prepare('SELECT title, revision, updated_at FROM projects WHERE owner_id = ?').bind(u.id).first<{ title: string; revision: number; updated_at: string }>(),
  ]);
  return c.json({
    user: { id: u.id, email: u.email, name: u.name, handle: u.handle, plan: u.plan },
    usage: { bytes: used, quota: quotaFor(u.plan) },
    project: project ? { title: project.title, revision: project.revision, updatedAt: project.updated_at } : null,
  });
});

app.put('/me', async c => {
  const u = c.get('user');
  const body = await c.req.json<{ handle?: string }>().catch(() => ({} as { handle?: string }));
  const handle = (body.handle ?? '').trim().toLowerCase();
  if (!HANDLE_RE.test(handle)) return c.json({ error: 'handles are 3 to 24 characters: letters, digits and dashes, starting with a letter or digit' }, 400);
  if (RESERVED.has(handle)) return c.json({ error: 'that handle is reserved' }, 409);
  const taken = await c.env.DB.prepare('SELECT id FROM user WHERE handle = ? AND id <> ?').bind(handle, u.id).first();
  if (taken) return c.json({ error: 'that handle is taken' }, 409);
  await c.env.DB.prepare('UPDATE user SET handle = ?, updatedAt = ? WHERE id = ?').bind(handle, now(), u.id).run();
  return c.json({ handle });
});

app.delete('/me', async c => {
  const u = c.get('user');
  // blobs this user uploaded that nobody else's project references
  const orphans = await c.env.DB.prepare(
    `SELECT b.hash FROM blobs b WHERE b.uploader_id = ? AND NOT EXISTS (
       SELECT 1 FROM project_blobs pb JOIN projects p ON p.id = pb.project_id WHERE pb.hash = b.hash AND p.owner_id <> ?)
     AND NOT EXISTS (SELECT 1 FROM kit_blobs kb JOIN kits k ON k.id = kb.kit_id WHERE kb.hash = b.hash AND k.owner_id <> ?)
     AND NOT EXISTS (SELECT 1 FROM samples s WHERE s.hash = b.hash AND s.owner_id <> ?)`,
  ).bind(u.id, u.id, u.id, u.id).all<{ hash: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM projects WHERE owner_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM kits WHERE owner_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM samples WHERE owner_id = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM blobs WHERE uploader_id = ? AND hash NOT IN (SELECT hash FROM project_blobs) AND hash NOT IN (SELECT hash FROM kit_blobs) AND hash NOT IN (SELECT hash FROM samples)').bind(u.id),
    c.env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM account WHERE userId = ?').bind(u.id),
    c.env.DB.prepare('DELETE FROM user WHERE id = ?').bind(u.id),
  ]);
  await Promise.all(orphans.results.map(o => c.env.BLOBS.delete(`blobs/${o.hash}`)));
  return c.json({ ok: true }, 200, { 'set-cookie': 'better-auth.session_token=; Path=/; Max-Age=0' });
});

// ---------- the project ----------
interface ProjectRow { id: string; title: string; manifest: string; revision: number; updated_at: string }
const projectOf = (env: Env, userId: string) => env.DB.prepare('SELECT id, title, manifest, revision, updated_at FROM projects WHERE owner_id = ?').bind(userId).first<ProjectRow>();

app.get('/project', async c => {
  const p = await projectOf(c.env, c.get('user').id);
  if (!p) return c.json({ error: 'no project yet' }, 404);
  return c.json({ manifest: JSON.parse(p.manifest), title: p.title, revision: p.revision, updatedAt: p.updated_at });
});

async function missingHashes(env: Env, hashes: string[]): Promise<string[]> {
  const missing: string[] = [];
  for (let i = 0; i < hashes.length; i += 50) {
    const chunk = hashes.slice(i, i + 50);
    const rows = await env.DB.prepare(`SELECT hash FROM blobs WHERE hash IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all<{ hash: string }>();
    const have = new Set(rows.results.map(r => r.hash));
    for (const h of chunk) if (!have.has(h)) missing.push(h);
  }
  return missing;
}

/** Store a manifest as the user's current project, keeping the previous one as a revision. */
async function storeProject(env: Env, userId: string, manifest: unknown, title: string, hashes: string[]): Promise<{ revision: number; updatedAt: string }> {
  const existing = await projectOf(env, userId);
  const ts = now();
  const id = existing?.id ?? newId();
  const revision = (existing?.revision ?? 0) + 1;
  const stmts: D1PreparedStatement[] = [];
  if (existing) {
    stmts.push(env.DB.prepare('INSERT OR REPLACE INTO project_revs (project_id, revision, title, manifest, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, existing.revision, existing.title, existing.manifest, existing.updated_at));
    stmts.push(env.DB.prepare('DELETE FROM project_revs WHERE project_id = ? AND revision <= ?').bind(id, revision - REVISIONS_KEPT - 1));
    stmts.push(env.DB.prepare('UPDATE projects SET title = ?, manifest = ?, revision = ?, updated_at = ? WHERE id = ?').bind(title, JSON.stringify(manifest), revision, ts, id));
    stmts.push(env.DB.prepare('DELETE FROM project_blobs WHERE project_id = ?').bind(id));
  } else {
    stmts.push(env.DB.prepare('INSERT INTO projects (id, owner_id, title, manifest, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, userId, title, JSON.stringify(manifest), revision, ts));
  }
  for (const h of hashes) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO project_blobs (project_id, hash) VALUES (?, ?)').bind(id, h));
  await env.DB.batch(stmts);
  return { revision, updatedAt: ts };
}

app.put('/project', async c => {
  const u = c.get('user');
  const body = await c.req.json<{ manifest?: unknown; title?: string; hashes?: string[] }>().catch(() => null);
  if (!body || typeof body.manifest !== 'object' || body.manifest === null) return c.json({ error: 'manifest required' }, 400);
  const hashes = Array.from(new Set((body.hashes ?? []).filter(h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h))));
  if (hashes.length > 500) return c.json({ error: 'too many sounds' }, 413);
  const missing = await missingHashes(c.env, hashes);
  if (missing.length) return c.json({ error: 'upload these sounds first', missing }, 409);
  const title = String(body.title ?? '').slice(0, 64);
  return c.json(await storeProject(c.env, u.id, body.manifest, title, hashes));
});

app.get('/project/revisions', async c => {
  const p = await projectOf(c.env, c.get('user').id);
  if (!p) return c.json({ current: null, revisions: [] });
  const revs = await c.env.DB.prepare('SELECT revision, title, created_at FROM project_revs WHERE project_id = ? ORDER BY revision DESC').bind(p.id).all<{ revision: number; title: string; created_at: string }>();
  return c.json({
    current: { revision: p.revision, title: p.title, updatedAt: p.updated_at },
    revisions: revs.results.map(r => ({ revision: r.revision, title: r.title, createdAt: r.created_at })),
  });
});

app.get('/project/revisions/:rev', async c => {
  const p = await projectOf(c.env, c.get('user').id);
  const rev = Number(c.req.param('rev'));
  if (!p) return c.json({ error: 'no project' }, 404);
  if (rev === p.revision) return c.json({ manifest: JSON.parse(p.manifest), title: p.title, revision: p.revision });
  const r = await c.env.DB.prepare('SELECT title, manifest FROM project_revs WHERE project_id = ? AND revision = ?').bind(p.id, rev).first<{ title: string; manifest: string }>();
  if (!r) return c.json({ error: 'no such revision' }, 404);
  return c.json({ manifest: JSON.parse(r.manifest), title: r.title, revision: rev });
});

/** Make an older revision the current one (the current one becomes a revision, nothing is lost). */
app.post('/project/restore/:rev', async c => {
  const u = c.get('user');
  const p = await projectOf(c.env, u.id);
  const rev = Number(c.req.param('rev'));
  if (!p) return c.json({ error: 'no project' }, 404);
  const r = await c.env.DB.prepare('SELECT title, manifest FROM project_revs WHERE project_id = ? AND revision = ?').bind(p.id, rev).first<{ title: string; manifest: string }>();
  if (!r) return c.json({ error: 'no such revision' }, 404);
  const manifest = JSON.parse(r.manifest) as { blobs?: Record<string, string> };
  const hashes = Object.values(manifest.blobs ?? {});
  return c.json(await storeProject(c.env, u.id, manifest, r.title, hashes));
});

// ---------- blobs ----------
const HASH_RE = /^[0-9a-f]{64}$/;

app.on('HEAD', '/blobs/:hash', async c => {
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.body(null, 400);
  const r = await c.env.DB.prepare('SELECT bytes FROM blobs WHERE hash = ?').bind(hash).first<{ bytes: number }>();
  return c.body(null, r ? 200 : 404, r ? { 'content-length': String(r.bytes) } : {});
});

app.post('/blobs/:hash', async c => {
  const u = c.get('user');
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  const have = await c.env.DB.prepare('SELECT bytes FROM blobs WHERE hash = ?').bind(hash).first<{ bytes: number }>();
  if (have) return c.json({ hash, bytes: have.bytes, existed: true });
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > MAX_BLOB_BYTES) return c.json({ error: 'sound too large' }, 413);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BLOB_BYTES) return c.json({ error: 'sound too large' }, 413);
  if ((await sha256Hex(bytes)) !== hash) return c.json({ error: 'hash does not match content' }, 400);
  const used = await usageBytes(c.env, u.id);
  if (used + bytes.byteLength > quotaFor(u.plan)) return c.json({ error: 'cloud storage is full', used, quota: quotaFor(u.plan) }, 507);
  const mime = c.req.header('content-type') ?? 'application/octet-stream';
  await c.env.BLOBS.put(`blobs/${hash}`, bytes, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare('INSERT OR IGNORE INTO blobs (hash, bytes, mime, uploader_id) VALUES (?, ?, ?, ?)').bind(hash, bytes.byteLength, mime, u.id).run();
  return c.json({ hash, bytes: bytes.byteLength, existed: false });
});

app.get('/blobs/:hash', async c => {
  const u = c.get('user') as SessionUser | undefined;
  const hash = c.req.param('hash');
  if (!HASH_RE.test(hash)) return c.json({ error: 'bad hash' }, 400);
  // public while a live kit names it; otherwise yours if you uploaded it or your project references it
  const isPublic = await c.env.DB.prepare(
    'SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM kit_blobs kb JOIN kits k ON k.id = kb.kit_id WHERE kb.hash = ? AND k.takedown = 0) OR EXISTS (SELECT 1 FROM samples s WHERE s.hash = ? AND s.takedown = 0)',
  ).bind(hash, hash).first();
  if (!isPublic) {
    if (!u) return c.json({ error: 'sign in first' }, 401);
    const ok = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM blobs b WHERE b.hash = ? AND (b.uploader_id = ? OR EXISTS (
         SELECT 1 FROM project_blobs pb JOIN projects p ON p.id = pb.project_id WHERE pb.hash = b.hash AND p.owner_id = ?)
         OR EXISTS (SELECT 1 FROM project_revs r JOIN projects p ON p.id = r.project_id WHERE p.owner_id = ? AND instr(r.manifest, b.hash) > 0))`,
    ).bind(hash, u.id, u.id, u.id).first();
    if (!ok) return c.json({ error: 'not found' }, 404);
  }
  const obj = await c.env.BLOBS.get(`blobs/${hash}`);
  if (!obj) return c.json({ error: 'not found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'content-length': String(obj.size), 'cache-control': `${isPublic ? 'public' : 'private'}, max-age=31536000, immutable`, etag: `"${hash}"` } });
});

app.notFound(c => c.json({ error: 'no such route' }, 404));
app.onError((err, c) => { console.error(err); return c.json({ error: 'server error' }, 500); });
