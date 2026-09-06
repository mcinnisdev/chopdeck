// The kit library: publish a program and its sounds, browse, fetch, send to the machine, remove.
// Kits are public. Their sound blobs become public too (see the blob route in app.ts).
import { Hono } from 'hono';
import type { Env } from './env';
import type { SessionUser } from './auth';

type Vars = { user: SessionUser };
export const kits = new Hono<{ Bindings: Env; Variables: Vars }>();

export const LICENSES = ['CC0', 'CC-BY', 'CC-BY-NC', 'CHOPDECK'] as const;
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kit';
const cleanTags = (tags: unknown): string[] => Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(t => t.length > 0 && t.length <= 24))).slice(0, 5) : [];
const now = () => new Date().toISOString();

interface KitRow { id: string; slug: string; title: string; description: string; tags: string; license: string; pads: string; sounds: number; bytes: number; downloads: number; featured: number; created_at: string; handle: string | null; owner_id: string | null }
const LIST_COLS = 'k.id, k.slug, k.title, k.description, k.tags, k.license, k.pads, k.sounds, k.bytes, k.downloads, k.featured, k.created_at, k.owner_id, u.handle';
const rowOut = (r: KitRow) => ({ id: r.id, slug: r.slug, title: r.title, description: r.description, tags: JSON.parse(r.tags) as string[], license: r.license, pads: JSON.parse(r.pads) as string[], sounds: r.sounds, bytes: r.bytes, downloads: r.downloads, featured: !!r.featured, createdAt: r.created_at, handle: r.handle });

/** Public: browse. Featured first, then newest. `q` matches title, description and tags; `tag` matches one tag. */
kits.get('/', async c => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 64);
  const tag = (c.req.query('tag') ?? '').trim().toLowerCase().slice(0, 24);
  const limit = Math.min(60, Math.max(1, Number(c.req.query('limit') ?? 30) || 30));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const where = ['k.takedown = 0'];
  const args: unknown[] = [];
  if (q) { where.push('(lower(k.title) LIKE ? OR lower(k.description) LIKE ? OR lower(k.tags) LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (tag) { where.push('k.tags LIKE ?'); args.push(`%"${tag}"%`); }
  const rows = await c.env.DB.prepare(`SELECT ${LIST_COLS} FROM kits k LEFT JOIN user u ON u.id = k.owner_id WHERE ${where.join(' AND ')} ORDER BY k.featured DESC, k.created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all<KitRow>();
  return c.json({ kits: rows.results.map(rowOut), offset, limit });
});

/** Signed in: the caller's own kits. */
kits.get('/mine', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const rows = await c.env.DB.prepare(`SELECT ${LIST_COLS} FROM kits k LEFT JOIN user u ON u.id = k.owner_id WHERE k.owner_id = ? ORDER BY k.created_at DESC`).bind(u.id).all<KitRow>();
  return c.json({ kits: rows.results.map(rowOut) });
});

/** Public: one kit with its manifest (program, sound metadata, blob hashes). */
kits.get('/:slug', async c => {
  const r = await c.env.DB.prepare(`SELECT ${LIST_COLS}, k.manifest FROM kits k LEFT JOIN user u ON u.id = k.owner_id WHERE k.slug = ? AND k.takedown = 0`).bind(c.req.param('slug')).first<KitRow & { manifest: string }>();
  if (!r) return c.json({ error: 'no such kit' }, 404);
  return c.json({ ...rowOut(r), manifest: JSON.parse(r.manifest) });
});

/** Public: count a send-to-machine. */
kits.post('/:slug/download', async c => {
  await c.env.DB.prepare('UPDATE kits SET downloads = downloads + 1 WHERE slug = ? AND takedown = 0').bind(c.req.param('slug')).run();
  return c.json({ ok: true });
});

/** Signed in, with a handle: publish. Every referenced blob must already be uploaded (409 lists the missing). */
kits.post('/', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  if (!u.handle) return c.json({ error: 'choose a handle on the account page first' }, 400);
  const body = await c.req.json<{ manifest?: { kind?: string; blobs?: Record<string, string>; sounds?: unknown[] }; title?: string; description?: string; tags?: unknown; license?: string; pads?: unknown; hashes?: string[] }>().catch(() => null);
  if (!body || !body.manifest || body.manifest.kind !== 'CHOPDECK-KIT') return c.json({ error: 'kit manifest required' }, 400);
  const title = String(body.title ?? '').trim().slice(0, 48);
  if (title.length < 2) return c.json({ error: 'give the kit a title' }, 400);
  const license = String(body.license ?? '');
  if (!(LICENSES as readonly string[]).includes(license)) return c.json({ error: 'choose a license' }, 400);
  const hashes = Array.from(new Set(Object.values(body.manifest.blobs ?? {}).filter(h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h))));
  if (hashes.length === 0) return c.json({ error: 'the kit has no sounds' }, 400);
  if (hashes.length > 64) return c.json({ error: 'too many sounds for one kit' }, 413);
  const have = await c.env.DB.prepare(`SELECT hash, bytes FROM blobs WHERE hash IN (${hashes.map(() => '?').join(',')})`).bind(...hashes).all<{ hash: string; bytes: number }>();
  const haveSet = new Map(have.results.map(r => [r.hash, r.bytes]));
  const missing = hashes.filter(h => !haveSet.has(h));
  if (missing.length) return c.json({ error: 'upload these sounds first', missing }, 409);
  const pads = Array.isArray(body.pads) ? body.pads.slice(0, 16).map(p => String(p ?? '').slice(0, 16)) : [];
  const description = String(body.description ?? '').trim().slice(0, 500);
  const tags = cleanTags(body.tags);
  const bytes = hashes.reduce((a, h) => a + (haveSet.get(h) ?? 0), 0);
  const base = `${u.handle}-${slugify(title)}`;
  let slug = base;
  for (let n = 2; await c.env.DB.prepare('SELECT 1 FROM kits WHERE slug = ?').bind(slug).first(); n++) slug = `${base}-${n}`;
  const id = crypto.randomUUID();
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO kits (id, owner_id, slug, title, description, tags, license, manifest, pads, sounds, bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.id, slug, title, description, JSON.stringify(tags), license, JSON.stringify(body.manifest), JSON.stringify(pads), hashes.length, bytes, ts, ts),
    ...hashes.map(h => c.env.DB.prepare('INSERT OR IGNORE INTO kit_blobs (kit_id, hash) VALUES (?, ?)').bind(id, h)),
    c.env.DB.prepare(`UPDATE blobs SET license = ? WHERE license = 'private' AND hash IN (${hashes.map(() => '?').join(',')})`).bind(license, ...hashes),
  ]);
  return c.json({ id, slug, url: `/kits/#${slug}` });
});

/** Owner: take a kit down. Its blobs stay public only while another live kit names them. */
kits.delete('/:id', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const r = await c.env.DB.prepare('DELETE FROM kits WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), u.id).run();
  if (!r.meta.changes) return c.json({ error: 'no such kit' }, 404);
  return c.json({ ok: true });
});
