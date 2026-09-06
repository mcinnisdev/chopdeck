// Beats: publish a project with its preview, browse, play, like, fetch for the machine, remix lineage.
// A beat's sounds, preview and cover are public while it is live (see the blob route in app.ts).
import { Hono } from 'hono';
import type { Env } from './env';
import type { SessionUser } from './auth';
import { LICENSES } from './kits';

type Vars = { user: SessionUser };
export const beats = new Hono<{ Bindings: Env; Variables: Vars }>();

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'beat';
const cleanTags = (tags: unknown): string[] => Array.isArray(tags) ? Array.from(new Set(tags.map(t => String(t).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(t => t.length > 0 && t.length <= 24))).slice(0, 5) : [];
const now = () => new Date().toISOString();
const HASH_RE = /^[0-9a-f]{64}$/;

interface Row { id: string; slug: string; title: string; description: string; tags: string; license: string; source_kind: string; source_index: number; bpm: number; duration_ms: number; preview_hash: string; cover_hash: string | null; peaks: string; parent_beat_id: string | null; plays: number; likes: number; remixes: number; featured: number; created_at: string; handle: string | null; owner_id: string; parent_slug: string | null; parent_title: string | null; parent_handle: string | null }
const COLS = `b.id, b.slug, b.title, b.description, b.tags, b.license, b.source_kind, b.source_index, b.bpm, b.duration_ms, b.preview_hash, b.cover_hash, b.peaks, b.parent_beat_id, b.plays, b.likes, b.remixes, b.featured, b.created_at, b.owner_id, u.handle,
  p.slug AS parent_slug, p.title AS parent_title, pu.handle AS parent_handle`;
const FROM = 'FROM beats b JOIN user u ON u.id = b.owner_id LEFT JOIN beats p ON p.id = b.parent_beat_id AND p.takedown = 0 LEFT JOIN user pu ON pu.id = p.owner_id';
const out = (r: Row) => ({
  id: r.id, slug: r.slug, handle: r.handle, url: `/beats/${r.handle}/${r.slug}`, title: r.title, description: r.description, tags: JSON.parse(r.tags) as string[], license: r.license,
  source: { kind: r.source_kind, index: r.source_index }, bpm: r.bpm, durationMs: r.duration_ms, previewHash: r.preview_hash, coverHash: r.cover_hash, peaks: JSON.parse(r.peaks) as number[],
  parent: r.parent_beat_id && r.parent_slug ? { id: r.parent_beat_id, slug: r.parent_slug, title: r.parent_title, handle: r.parent_handle, url: `/beats/${r.parent_handle}/${r.parent_slug}` } : null,
  plays: r.plays, likes: r.likes, remixes: r.remixes, featured: !!r.featured, createdAt: r.created_at,
});

beats.get('/', async c => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 64);
  const tag = (c.req.query('tag') ?? '').trim().toLowerCase().slice(0, 24);
  const handle = (c.req.query('handle') ?? '').trim().toLowerCase().slice(0, 24);
  const sort = { new: 'b.created_at DESC', plays: 'b.plays DESC, b.created_at DESC', likes: 'b.likes DESC, b.created_at DESC', remixes: 'b.remixes DESC, b.created_at DESC' }[c.req.query('sort') ?? 'new'] ?? 'b.created_at DESC';
  const limit = Math.min(60, Math.max(1, Number(c.req.query('limit') ?? 30) || 30));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const where = ['b.takedown = 0']; const args: unknown[] = [];
  if (q) { where.push('(lower(b.title) LIKE ? OR lower(b.description) LIKE ? OR lower(b.tags) LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (tag) { where.push('b.tags LIKE ?'); args.push(`%"${tag}"%`); }
  if (handle) { where.push('u.handle = ?'); args.push(handle); }
  const rows = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY b.featured DESC, ${sort} LIMIT ? OFFSET ?`).bind(...args, limit, offset).all<Row>();
  return c.json({ beats: rows.results.map(out), offset, limit });
});

beats.get('/mine', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const rows = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE b.owner_id = ? ORDER BY b.created_at DESC`).bind(u.id).all<Row>();
  return c.json({ beats: rows.results.map(out) });
});

/** A beat by id (remix lineage on the publish page). Declared before the handle/slug route so 'by-id' is never read as a handle. */
beats.get('/by-id/:id', async c => {
  const r = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE b.id = ? AND b.takedown = 0`).bind(c.req.param('id')).first<Row>();
  return r ? c.json(out(r)) : c.json({ error: 'no such beat' }, 404);
});

const oneRow = (env: Env, handle: string, slug: string) => env.DB.prepare(`SELECT ${COLS}, b.manifest ${FROM} WHERE u.handle = ? AND b.slug = ? AND b.takedown = 0`).bind(handle, slug).first<Row & { manifest: string }>();

beats.get('/:handle/:slug', async c => {
  const r = await oneRow(c.env, c.req.param('handle'), c.req.param('slug'));
  if (!r) return c.json({ error: 'no such beat' }, 404);
  const u = c.get('user') as SessionUser | undefined;
  const liked = u ? !!(await c.env.DB.prepare('SELECT 1 FROM beat_likes WHERE user_id = ? AND beat_id = ?').bind(u.id, r.id).first()) : false;
  const remixes = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE b.parent_beat_id = ? AND b.takedown = 0 ORDER BY b.created_at DESC LIMIT 20`).bind(r.id).all<Row>();
  return c.json({ ...out(r), liked, remixList: remixes.results.map(out) });
});

/** The project as made, for OPEN ON THE MACHINE and REMIX. */
beats.get('/:handle/:slug/manifest', async c => {
  const r = await oneRow(c.env, c.req.param('handle'), c.req.param('slug'));
  if (!r) return c.json({ error: 'no such beat' }, 404);
  return c.json({ id: r.id, manifest: JSON.parse(r.manifest) });
});

beats.post('/:handle/:slug/play', async c => {
  await c.env.DB.prepare('UPDATE beats SET plays = plays + 1 WHERE slug = ? AND owner_id = (SELECT id FROM user WHERE handle = ?) AND takedown = 0').bind(c.req.param('slug'), c.req.param('handle')).run();
  return c.json({ ok: true });
});

beats.post('/:handle/:slug/like', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const r = await oneRow(c.env, c.req.param('handle'), c.req.param('slug'));
  if (!r) return c.json({ error: 'no such beat' }, 404);
  const had = await c.env.DB.prepare('SELECT 1 FROM beat_likes WHERE user_id = ? AND beat_id = ?').bind(u.id, r.id).first();
  await c.env.DB.batch(had
    ? [c.env.DB.prepare('DELETE FROM beat_likes WHERE user_id = ? AND beat_id = ?').bind(u.id, r.id), c.env.DB.prepare('UPDATE beats SET likes = MAX(0, likes - 1) WHERE id = ?').bind(r.id)]
    : [c.env.DB.prepare('INSERT INTO beat_likes (user_id, beat_id) VALUES (?, ?)').bind(u.id, r.id), c.env.DB.prepare('UPDATE beats SET likes = likes + 1 WHERE id = ?').bind(r.id)]);
  const likes = (await c.env.DB.prepare('SELECT likes FROM beats WHERE id = ?').bind(r.id).first<{ likes: number }>())?.likes ?? 0;
  return c.json({ liked: !had, likes });
});

/** Publish. Every sound must be the caller's own upload or already public; the preview must be uploaded. */
beats.post('/', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  if (!u.handle) return c.json({ error: 'choose a handle on the account page first' }, 400);
  const b = await c.req.json<{ manifest?: { kind?: string; blobs?: Record<string, string>; machine?: { sounds?: { id: string; name: string }[] } }; previewHash?: string; coverHash?: string; title?: string; description?: string; tags?: unknown; license?: string; source?: { kind?: string; index?: number }; bpm?: number; durationMs?: number; peaks?: unknown; parentBeat?: string | null }>().catch(() => null);
  if (!b?.manifest || b.manifest.kind !== 'CHOPDECK-MANIFEST') return c.json({ error: 'project manifest required' }, 400);
  const title = String(b.title ?? '').trim().slice(0, 64);
  if (title.length < 2) return c.json({ error: 'give the beat a title' }, 400);
  const license = String(b.license ?? '');
  if (!(LICENSES as readonly string[]).includes(license)) return c.json({ error: 'choose a license' }, 400);
  const previewHash = String(b.previewHash ?? '');
  if (!HASH_RE.test(previewHash)) return c.json({ error: 'preview required' }, 400);
  const coverHash = b.coverHash && HASH_RE.test(String(b.coverHash)) ? String(b.coverHash) : null;
  const hashes = Array.from(new Set(Object.values(b.manifest.blobs ?? {}).filter(h => typeof h === 'string' && HASH_RE.test(h))));
  const all = Array.from(new Set([...hashes, previewHash, ...(coverHash ? [coverHash] : [])]));
  const rows = await c.env.DB.prepare(`SELECT hash, uploader_id FROM blobs WHERE hash IN (${all.map(() => '?').join(',')})`).bind(...all).all<{ hash: string; uploader_id: string | null }>();
  const have = new Map(rows.results.map(r => [r.hash, r.uploader_id]));
  const missing = all.filter(h => !have.has(h));
  if (missing.length) return c.json({ error: 'upload these first', missing }, 409);
  // sounds someone else uploaded must already be public (a live kit, sample or beat)
  const foreign = hashes.filter(h => have.get(h) !== u.id);
  if (foreign.length) {
    const pub = await c.env.DB.prepare(`SELECT hash FROM (
        SELECT kb.hash FROM kit_blobs kb JOIN kits k ON k.id = kb.kit_id WHERE k.takedown = 0
        UNION SELECT s.hash FROM samples s WHERE s.takedown = 0
        UNION SELECT bb.hash FROM beat_blobs bb JOIN beats x ON x.id = bb.beat_id WHERE x.takedown = 0
        UNION SELECT hash FROM blobs WHERE uploader_id IS NULL
      ) WHERE hash IN (${foreign.map(() => '?').join(',')})`).bind(...foreign).all<{ hash: string }>();
    const ok = new Set(pub.results.map(r => r.hash));
    const blocked = foreign.filter(h => !ok.has(h));
    if (blocked.length) {
      const names = (b.manifest.machine?.sounds ?? []).filter(s => blocked.includes(b.manifest!.blobs?.[s.id] ?? '')).map(s => s.name);
      return c.json({ error: 'some sounds are not yours to publish', blocked: names }, 403);
    }
  }
  const parent = b.parentBeat ? await c.env.DB.prepare('SELECT id FROM beats WHERE id = ? AND takedown = 0').bind(String(b.parentBeat)).first<{ id: string }>() : null;
  const base = slugify(title);
  let slug = base;
  for (let n = 2; await c.env.DB.prepare('SELECT 1 FROM beats WHERE owner_id = ? AND slug = ?').bind(u.id, slug).first(); n++) slug = `${base}-${n}`;
  const id = crypto.randomUUID(); const ts = now();
  const source = { kind: b.source?.kind === 'song' ? 'song' : 'sequence', index: Math.max(0, Math.round(Number(b.source?.index) || 0)) };
  const peaks = Array.isArray(b.peaks) ? b.peaks.slice(0, 400).map(p => Math.max(0, Math.min(1, Math.round((Number(p) || 0) * 100) / 100))) : [];
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO beats (id, owner_id, slug, title, description, tags, license, source_kind, source_index, bpm, duration_ms, manifest, preview_hash, cover_hash, peaks, parent_beat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, u.id, slug, title, String(b.description ?? '').trim().slice(0, 1000), JSON.stringify(cleanTags(b.tags)), license, source.kind, source.index, Math.max(20, Math.min(400, Number(b.bpm) || 120)), Math.max(0, Math.round(Number(b.durationMs) || 0)), JSON.stringify(b.manifest), previewHash, coverHash, JSON.stringify(peaks), parent?.id ?? null, ts, ts),
    ...all.map(h => c.env.DB.prepare('INSERT OR IGNORE INTO beat_blobs (beat_id, hash) VALUES (?, ?)').bind(id, h)),
    c.env.DB.prepare(`UPDATE blobs SET license = ? WHERE license = 'private' AND hash IN (${all.map(() => '?').join(',')})`).bind(license, ...all),
    ...(parent ? [c.env.DB.prepare('UPDATE beats SET remixes = remixes + 1 WHERE id = ?').bind(parent.id)] : []),
  ]);
  return c.json({ id, slug, url: `/beats/${u.handle}/${slug}` });
});

beats.delete('/:id', async c => {
  const u = c.get('user');
  if (!u) return c.json({ error: 'sign in first' }, 401);
  const r = await c.env.DB.prepare('DELETE FROM beats WHERE id = ? AND owner_id = ?').bind(c.req.param('id'), u.id).run();
  if (!r.meta.changes) return c.json({ error: 'no such beat' }, 404);
  return c.json({ ok: true });
});
