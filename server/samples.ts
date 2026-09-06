// The samples library: single sounds (records, breaks, hits) published for chopping. A sample points
// at one .SND blob, which is public while the sample is live (see the blob route in app.ts).
import { Hono } from 'hono';
import type { Env } from './env';
import type { SessionUser } from './auth';
import { LICENSES } from './kits';

type Vars = { user: SessionUser };
export const samples = new Hono<{ Bindings: Env; Variables: Vars }>();

const MAX_DURATION_MS = 4 * 60 * 1000;
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sample';
const cleanTags = (tags: unknown): string[] => Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(t => t.length > 0 && t.length <= 24))).slice(0, 5) : [];
const now = () => new Date().toISOString();

interface Row { id: string; slug: string; hash: string; title: string; description: string; tags: string; license: string; source: string; duration_ms: number; rate: number; channels: number; bytes: number; peaks: string; downloads: number; featured: number; created_at: string; handle: string | null; owner_id: string | null }
const COLS = 's.id, s.slug, s.hash, s.title, s.description, s.tags, s.license, s.source, s.duration_ms, s.rate, s.channels, s.bytes, s.peaks, s.downloads, s.featured, s.created_at, s.owner_id, u.handle';
const out = (r: Row) => ({ id: r.id, slug: r.slug, hash: r.hash, title: r.title, description: r.description, tags: JSON.parse(r.tags) as string[], license: r.license, source: r.source, durationMs: r.duration_ms, rate: r.rate, channels: r.channels, bytes: r.bytes, peaks: JSON.parse(r.peaks) as number[], downloads: r.downloads, featured: !!r.featured, createdAt: r.created_at, handle: r.handle });

samples.get('/', async c => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 64);
  const tag = (c.req.query('tag') ?? '').trim().toLowerCase().slice(0, 24);
  const limit = Math.min(60, Math.max(1, Number(c.req.query('limit') ?? 30) || 30));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const where = ['s.takedown = 0'];
  const args: unknown[] = [];
  if (q) { where.push('(lower(s.title) LIKE ? OR lower(s.description) LIKE ? OR lower(s.tags) LIKE ? OR lower(s.source) LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`); }
  if (tag) { where.push('s.tags LIKE ?'); args.push(`%"${tag}"%`); }
  const rows = await c.env.DB.prepare(`SELECT ${COLS} FROM samples s LEFT JOIN user u ON u.id = s.owner_id WHERE ${where.join(' AND ')} ORDER BY s.featured DESC, s.created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all<Row>();
  return c.json({ samples: rows.results.map(out), offset, limit });
});

samples.get('/mine', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const rows = await c.env.DB.prepare(`SELECT ${COLS} FROM samples s LEFT JOIN user u ON u.id = s.owner_id WHERE s.owner_id = ? ORDER BY s.created_at DESC`).bind(u.id).all<Row>();
  return c.json({ samples: rows.results.map(out) });
});

samples.get('/:slug', async c => {
  const r = await c.env.DB.prepare(`SELECT ${COLS} FROM samples s LEFT JOIN user u ON u.id = s.owner_id WHERE s.slug = ? AND s.takedown = 0`).bind(c.req.param('slug')).first<Row>();
  return r ? c.json(out(r)) : c.json({ error: 'no such sample' }, 404);
});

samples.post('/:slug/download', async c => {
  await c.env.DB.prepare('UPDATE samples SET downloads = downloads + 1 WHERE slug = ? AND takedown = 0').bind(c.req.param('slug')).run();
  return c.json({ ok: true });
});

/** Publish an uploaded .SND blob as a sample. */
samples.post('/', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  if (!u.handle) return c.json({ error: 'choose a handle on the account page first' }, 400);
  const b = await c.req.json<{ hash?: string; title?: string; description?: string; tags?: unknown; license?: string; source?: string; durationMs?: number; rate?: number; channels?: number; peaks?: unknown; rights?: boolean }>().catch(() => null);
  if (!b) return c.json({ error: 'bad request' }, 400);
  const hash = String(b.hash ?? '');
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'upload the sound first' }, 400);
  const blob = await c.env.DB.prepare('SELECT bytes FROM blobs WHERE hash = ?').bind(hash).first<{ bytes: number }>();
  if (!blob) return c.json({ error: 'upload the sound first', missing: [hash] }, 409);
  const title = String(b.title ?? '').trim().slice(0, 64);
  if (title.length < 2) return c.json({ error: 'give the sample a title' }, 400);
  const license = String(b.license ?? '');
  if (!(LICENSES as readonly string[]).includes(license)) return c.json({ error: 'choose a license' }, 400);
  if (b.rights !== true) return c.json({ error: 'confirm you have the right to share it' }, 400);
  const durationMs = Math.max(0, Math.round(Number(b.durationMs ?? 0) || 0));
  if (durationMs > MAX_DURATION_MS) return c.json({ error: 'samples are at most four minutes' }, 413);
  const peaks = Array.isArray(b.peaks) ? b.peaks.slice(0, 400).map(p => Math.max(0, Math.min(1, Math.round((Number(p) || 0) * 100) / 100))) : [];
  const base = `${u.handle}-${slugify(title)}`;
  let slug = base;
  for (let n = 2; await c.env.DB.prepare('SELECT 1 FROM samples WHERE slug = ?').bind(slug).first(); n++) slug = `${base}-${n}`;
  const id = crypto.randomUUID();
  const ts = now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO samples (id, owner_id, hash, slug, title, description, tags, license, source, duration_ms, rate, channels, bytes, peaks, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.id, hash, slug, title, String(b.description ?? '').trim().slice(0, 500), JSON.stringify(cleanTags(b.tags)), license, String(b.source ?? '').trim().slice(0, 300), durationMs, Math.round(Number(b.rate) || 44100), Number(b.channels) === 2 ? 2 : 1, blob.bytes, JSON.stringify(peaks), ts, ts),
    c.env.DB.prepare("UPDATE blobs SET license = ? WHERE license = 'private' AND hash = ?").bind(license, hash),
  ]);
  return c.json({ id, slug, url: `/samples/#${slug}` });
});

samples.delete('/:id', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const r = await c.env.DB.prepare('DELETE FROM samples WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), u.id).run();
  if (!r.meta.changes) return c.json({ error: 'no such sample' }, 404);
  return c.json({ ok: true });
});
