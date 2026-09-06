// Curation: seeding the libraries with public-domain material and flagging items. Guarded by the
// ADMIN_TOKEN secret (Authorization: Bearer ...), never by a user session. Curated items have no
// owner and show as "Chop Deck" in the libraries.
import { Hono } from 'hono';
import { MAX_BLOB_BYTES, type Env } from './env';
import { LICENSES } from './kits';
import { sha256Hex } from './hash';

export const admin = new Hono<{ Bindings: Env }>();

admin.use('/*', async (c, next) => {
  const given = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!c.env.ADMIN_TOKEN || given.length < 16 || given !== c.env.ADMIN_TOKEN) return c.json({ error: 'admin token required' }, 401);
  await next();
});

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
const cleanTags = (tags: unknown): string[] => Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(t => t.length > 0 && t.length <= 24))).slice(0, 5) : [];

/** Store a blob with no owner and no quota. */
admin.post('/blobs/:hash', async c => {
  const hash = c.req.param('hash');
  if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'bad hash' }, 400);
  const have = await c.env.DB.prepare('SELECT bytes FROM blobs WHERE hash = ?').bind(hash).first<{ bytes: number }>();
  if (have) return c.json({ hash, bytes: have.bytes, existed: true });
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BLOB_BYTES) return c.json({ error: 'too large' }, 413);
  if ((await sha256Hex(bytes)) !== hash) return c.json({ error: 'hash does not match content' }, 400);
  const mime = c.req.header('content-type') ?? 'application/octet-stream';
  await c.env.BLOBS.put(`blobs/${hash}`, bytes, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare('INSERT OR IGNORE INTO blobs (hash, bytes, mime, uploader_id, license) VALUES (?, ?, ?, NULL, ?)').bind(hash, bytes.byteLength, mime, c.req.query('license') ?? 'PD').run();
  return c.json({ hash, bytes: bytes.byteLength, existed: false });
});

/** Remove a blob nothing references any more (a failed or test upload). */
admin.delete('/blobs/:hash', async c => {
  const hash = c.req.param('hash');
  const used = await c.env.DB.prepare('SELECT 1 AS ok WHERE EXISTS (SELECT 1 FROM project_blobs WHERE hash = ?) OR EXISTS (SELECT 1 FROM kit_blobs WHERE hash = ?) OR EXISTS (SELECT 1 FROM samples WHERE hash = ?)').bind(hash, hash, hash).first();
  if (used) return c.json({ error: 'still referenced' }, 409);
  await c.env.DB.prepare('DELETE FROM blobs WHERE hash = ?').bind(hash).run();
  await c.env.BLOBS.delete(`blobs/${hash}`);
  return c.json({ ok: true });
});

/** Publish a curated sample (owner: Chop Deck). Same fields as the public route plus `featured`. */
admin.post('/samples', async c => {
  const b = await c.req.json<{ hash?: string; title?: string; description?: string; tags?: unknown; license?: string; source?: string; durationMs?: number; rate?: number; channels?: number; peaks?: unknown; featured?: boolean; slug?: string }>().catch(() => null);
  if (!b) return c.json({ error: 'bad request' }, 400);
  const hash = String(b.hash ?? '');
  const blob = await c.env.DB.prepare('SELECT bytes FROM blobs WHERE hash = ?').bind(hash).first<{ bytes: number }>();
  if (!blob) return c.json({ error: 'upload the blob first' }, 409);
  const title = String(b.title ?? '').trim().slice(0, 64);
  if (title.length < 2) return c.json({ error: 'title' }, 400);
  const license = String(b.license ?? 'PD');
  if (!(LICENSES as readonly string[]).includes(license)) return c.json({ error: 'license' }, 400);
  const base = `chopdeck-${slugify(b.slug ?? title)}`;
  let slug = base;
  for (let n = 2; await c.env.DB.prepare('SELECT 1 FROM samples WHERE slug = ?').bind(slug).first(); n++) slug = `${base}-${n}`;
  const peaks = Array.isArray(b.peaks) ? b.peaks.slice(0, 400).map(p => Math.max(0, Math.min(1, Math.round((Number(p) || 0) * 100) / 100))) : [];
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  await c.env.DB.prepare('INSERT INTO samples (id, owner_id, hash, slug, title, description, tags, license, source, duration_ms, rate, channels, bytes, peaks, featured, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, hash, slug, title, String(b.description ?? '').trim().slice(0, 500), JSON.stringify(cleanTags(b.tags)), license, String(b.source ?? '').trim().slice(0, 300), Math.max(0, Math.round(Number(b.durationMs) || 0)), Math.round(Number(b.rate) || 44100), Number(b.channels) === 2 ? 2 : 1, blob.bytes, JSON.stringify(peaks), b.featured ? 1 : 0, ts, ts).run();
  return c.json({ id, slug, url: `/samples/#${slug}` });
});

/** Every sample or kit, live or not, for curation. */
admin.get('/:table{samples|kits}', async c => {
  const t = c.req.param('table');
  const rows = await c.env.DB.prepare(`SELECT id, slug, title, featured, takedown, downloads, created_at FROM ${t} ORDER BY created_at DESC`).all();
  return c.json({ items: rows.results });
});

/** Flag a sample or kit: featured and takedown. */
admin.put('/:table{samples|kits}/:id', async c => {
  const t = c.req.param('table');
  const b = await c.req.json<{ featured?: boolean; takedown?: boolean }>().catch(() => ({} as { featured?: boolean; takedown?: boolean }));
  const sets: string[] = []; const args: unknown[] = [];
  if (typeof b.featured === 'boolean') { sets.push('featured = ?'); args.push(b.featured ? 1 : 0); }
  if (typeof b.takedown === 'boolean') { sets.push('takedown = ?'); args.push(b.takedown ? 1 : 0); }
  if (!sets.length) return c.json({ error: 'nothing to set' }, 400);
  const r = await c.env.DB.prepare(`UPDATE ${t} SET ${sets.join(', ')} WHERE id = ? OR slug = ?`).bind(...args, c.req.param('id'), c.req.param('id')).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'no such item' }, 404);
});

admin.delete('/:table{samples|kits}/:id', async c => {
  const t = c.req.param('table');
  const r = await c.env.DB.prepare(`DELETE FROM ${t} WHERE id = ? OR slug = ?`).bind(c.req.param('id'), c.req.param('id')).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'no such item' }, 404);
});
