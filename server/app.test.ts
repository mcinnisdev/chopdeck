// The API against a real local D1 and R2 (Miniflare). Covers the whole phase-7 loop: magic-link
// sign-in, handle, blob upload with hash and quota checks, project sync with missing-blob 409,
// revisions and restore, blob access rules, account deletion.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { app, sha256Hex } from './app';
import type { Env } from './env';

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'http://localhost:5173';
let mf: Miniflare;
let env: Env;

async function applySchema(db: D1Database) {
  const sql = readFileSync(path.join(here, 'schema.sql'), 'utf8');
  const stmts = sql.split(';').map(s => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const s of stmts) await db.prepare(s).run();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("unused") } }',
    d1Databases: { DB: 'chopdeck-test' },
    r2Buckets: ['BLOBS'],
  });
  const DB = (await mf.getD1Database('DB')) as unknown as D1Database;
  const BLOBS = (await mf.getR2Bucket('BLOBS')) as unknown as R2Bucket;
  await applySchema(DB);
  env = { DB, BLOBS, ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher, SITE_URL: SITE, BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1234', DEV_MAGIC_LINKS: '1' };
}, 60_000);
afterAll(async () => { await mf?.dispose(); });

const call = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const headers = new Headers(init.headers);
  headers.set('origin', SITE);
  if (init.cookie) headers.set('cookie', init.cookie);
  const { cookie, ...rest } = init; void cookie;
  return app.fetch(new Request(`${SITE}${path}`, { ...rest, headers }), env);
};
const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

/** Magic-link sign-in for a test address; returns the session cookie. */
async function signIn(email: string): Promise<string> {
  const r = await call('/api/auth/sign-in/magic-link', { method: 'POST', ...json({ email, callbackURL: '/account/' }) });
  expect(r.status, await r.text()).toBe(200);
  const link = await (await call(`/api/dev/magic-link?email=${encodeURIComponent(email)}`)).json() as { url: string };
  expect(link.url).toContain('/api/auth/magic-link/verify');
  const v = await app.fetch(new Request(link.url, { redirect: 'manual' }), env);
  expect([302, 200]).toContain(v.status);
  const setCookie = v.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/better-auth\.session_token=([^;]+)/);
  expect(m, setCookie).toBeTruthy();
  return `better-auth.session_token=${m![1]}`;
}

describe('api', () => {
  it('refuses everything but auth and health when signed out', async () => {
    expect((await call('/api/health')).status).toBe(200);
    expect((await call('/api/me')).status).toBe(401);
    expect((await call('/api/project')).status).toBe(401);
  });

  it('signs in with a magic link, chooses a handle, syncs a project with blobs, keeps revisions, deletes the account', async () => {
    const cookie = await signIn('nick@example.com');
    let me = await (await call('/api/me', { cookie })).json() as { user: { email: string; handle: string | null; plan: string }; usage: { bytes: number; quota: number }; project: unknown };
    expect(me.user.email).toBe('nick@example.com');
    expect(me.user.handle).toBeNull();
    expect(me.user.plan).toBe('free');
    expect(me.project).toBeNull();

    // handles
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'ab' }) })).status).toBe(400);
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'admin' }) })).status).toBe(409);
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'Nick-Beats' }) })).status).toBe(200);
    me = await (await call('/api/me', { cookie })).json() as typeof me;
    expect(me.user.handle).toBe('nick-beats');

    // a project that references a sound we have not uploaded yet
    const sound = new TextEncoder().encode('pretend this is a .SND bundle');
    const hash = await sha256Hex(sound);
    let r = await call('/api/project', { method: 'PUT', cookie, ...json({ manifest: { kind: 'CHOPDECK-MANIFEST', blobs: { s1: hash } }, title: 'First Beat', hashes: [hash] }) });
    expect(r.status).toBe(409);
    expect((await r.json() as { missing: string[] }).missing).toEqual([hash]);

    // upload it: wrong hash refused, right hash stored, second upload deduped
    expect((await call(`/api/blobs/${'0'.repeat(64)}`, { method: 'POST', cookie, body: sound, headers: { 'content-type': 'application/zip' } })).status).toBe(400);
    expect((await call(`/api/blobs/${hash}`, { method: 'HEAD', cookie })).status).toBe(404);
    r = await call(`/api/blobs/${hash}`, { method: 'POST', cookie, body: sound, headers: { 'content-type': 'application/zip' } });
    expect(r.status).toBe(200);
    expect((await r.json() as { existed: boolean }).existed).toBe(false);
    r = await call(`/api/blobs/${hash}`, { method: 'POST', cookie, body: sound, headers: { 'content-type': 'application/zip' } });
    expect((await r.json() as { existed: boolean }).existed).toBe(true);
    expect((await call(`/api/blobs/${hash}`, { method: 'HEAD', cookie })).status).toBe(200);

    // now the project saves, and again with a change
    r = await call('/api/project', { method: 'PUT', cookie, ...json({ manifest: { kind: 'CHOPDECK-MANIFEST', v: 1, blobs: { s1: hash } }, title: 'First Beat', hashes: [hash] }) });
    expect(r.status).toBe(200);
    expect((await r.json() as { revision: number }).revision).toBe(1);
    r = await call('/api/project', { method: 'PUT', cookie, ...json({ manifest: { kind: 'CHOPDECK-MANIFEST', v: 2, blobs: { s1: hash } }, title: 'Second Beat', hashes: [hash] }) });
    expect((await r.json() as { revision: number }).revision).toBe(2);
    const got = await (await call('/api/project', { cookie })).json() as { manifest: { v: number }; title: string; revision: number };
    expect(got.manifest.v).toBe(2);
    expect(got.title).toBe('Second Beat');
    me = await (await call('/api/me', { cookie })).json() as typeof me;
    expect(me.usage.bytes).toBe(sound.byteLength);
    expect((me.project as { revision: number }).revision).toBe(2);

    // revisions: the first save is kept and can be restored (which itself becomes revision 3)
    const revs = await (await call('/api/project/revisions', { cookie })).json() as { current: { revision: number }; revisions: { revision: number; title: string }[] };
    expect(revs.current.revision).toBe(2);
    expect(revs.revisions.map(x => x.revision)).toEqual([1]);
    expect(revs.revisions[0].title).toBe('First Beat');
    expect(((await (await call('/api/project/revisions/1', { cookie })).json()) as { manifest: { v: number } }).manifest.v).toBe(1);
    r = await call('/api/project/restore/1', { method: 'POST', cookie });
    expect((await r.json() as { revision: number }).revision).toBe(3);
    expect(((await (await call('/api/project', { cookie })).json()) as { manifest: { v: number } }).manifest.v).toBe(1);

    // the blob comes back byte for byte, and not for a stranger
    r = await call(`/api/blobs/${hash}`, { cookie });
    expect(r.status).toBe(200);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(sound);
    const other = await signIn('someone@example.com');
    expect((await call(`/api/blobs/${hash}`, { cookie: other })).status).toBe(404);
    expect((await call('/api/me', { method: 'PUT', cookie: other, ...json({ handle: 'nick-beats' }) })).status).toBe(409);

    // delete: the account, the project and the orphaned blob are gone; the session is dead
    expect((await call('/api/me', { method: 'DELETE', cookie })).status).toBe(200);
    expect((await call('/api/me', { cookie })).status).toBe(401);
    expect((await call(`/api/blobs/${hash}`, { method: 'HEAD', cookie: other })).status).toBe(404);
    expect(await env.BLOBS.get(`blobs/${hash}`)).toBeNull();
  }, 60_000);

  it('publishes a kit, lists it publicly with public blobs, counts sends, and lets only the owner remove it', async () => {
    const cookie = await signIn('kits@example.com');
    const sound = new TextEncoder().encode('a kit sound');
    const hash = await sha256Hex(sound);
    const manifest = { kind: 'CHOPDECK-KIT', version: 1, title: 'Dusty Drums', program: { name: 'DUSTY' }, sounds: [{ id: 's1', name: 'KICK' }], blobs: { s1: hash } };
    const body = { manifest, title: 'Dusty Drums', description: 'From a 1972 record.', tags: ['Boom Bap', 'breaks', 'breaks', 'x'.repeat(40)], license: 'CC-BY', pads: ['KICK', '', 'SNARE'], hashes: [hash] };

    // needs a handle, then the sounds, then it publishes; a second publish gets a numbered slug
    let r = await call('/api/kits', { method: 'POST', cookie, ...json(body) });
    expect(r.status).toBe(400);
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'kitmaker' }) })).status).toBe(200);
    r = await call('/api/kits', { method: 'POST', cookie, ...json(body) });
    expect(r.status).toBe(409);
    expect((await call(`/api/blobs/${hash}`, { method: 'POST', cookie, body: sound })).status).toBe(200);
    // before publishing, a stranger cannot fetch the blob
    expect((await call(`/api/blobs/${hash}`)).status).toBe(401);
    r = await call('/api/kits', { method: 'POST', cookie, ...json(body) });
    const pubText = await r.text();
    expect(r.status, pubText).toBe(200);
    const pub = JSON.parse(pubText) as { id: string; slug: string; url: string };
    expect(pub.slug).toBe('kitmaker-dusty-drums');
    r = await call('/api/kits', { method: 'POST', cookie, ...json(body) });
    expect((await r.json() as { slug: string }).slug).toBe('kitmaker-dusty-drums-2');
    expect((await call('/api/kits', { method: 'POST', cookie, ...json({ ...body, license: 'GPL' }) })).status).toBe(400);

    // public listing, search, tag filter, detail
    let list = await (await call('/api/kits')).json() as { kits: { slug: string; tags: string[]; handle: string; pads: string[]; sounds: number; bytes: number; license: string }[] };
    expect(list.kits.map(k => k.slug)).toEqual(['kitmaker-dusty-drums-2', 'kitmaker-dusty-drums']);
    expect(list.kits[0].tags).toEqual(['boom-bap', 'breaks']);
    expect(list.kits[0].handle).toBe('kitmaker');
    expect(list.kits[0].pads).toEqual(['KICK', '', 'SNARE']);
    expect(list.kits[0].sounds).toBe(1);
    expect(list.kits[0].bytes).toBe(sound.byteLength);
    list = await (await call('/api/kits?q=1972')).json() as typeof list;
    expect(list.kits.length).toBe(2);
    list = await (await call('/api/kits?tag=boom-bap')).json() as typeof list;
    expect(list.kits.length).toBe(2);
    list = await (await call('/api/kits?q=nothing-like-this')).json() as typeof list;
    expect(list.kits.length).toBe(0);
    const detail = await (await call(`/api/kits/${pub.slug}`)).json() as { manifest: { blobs: Record<string, string> }; license: string };
    expect(detail.manifest.blobs.s1).toBe(hash);
    expect(detail.license).toBe('CC-BY');

    // the kit's blob is public now, with a public cache header
    r = await call(`/api/blobs/${hash}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('public');

    // sends are counted; mine lists both; a stranger cannot remove; the owner can
    expect((await call(`/api/kits/${pub.slug}/download`, { method: 'POST' })).status).toBe(200);
    expect(((await (await call(`/api/kits/${pub.slug}`)).json()) as { downloads: number }).downloads).toBe(1);
    const mine = await (await call('/api/kits/mine', { cookie })).json() as { kits: unknown[] };
    expect(mine.kits.length).toBe(2);
    expect((await call('/api/kits/mine')).status).toBe(401);
    const stranger = await signIn('stranger@example.com');
    expect((await call(`/api/kits/${pub.id}`, { method: 'DELETE', cookie: stranger })).status).toBe(404);
    expect((await call(`/api/kits/${pub.id}`, { method: 'DELETE', cookie })).status).toBe(200);
    list = await (await call('/api/kits')).json() as typeof list;
    expect(list.kits.map(k => k.slug)).toEqual(['kitmaker-dusty-drums-2']);
    // still public through the remaining kit; private again once that goes too
    expect((await call(`/api/blobs/${hash}`)).status).toBe(200);
    const other = (await (await call('/api/kits/mine', { cookie })).json() as { kits: { id: string }[] }).kits[0];
    expect((await call(`/api/kits/${other.id}`, { method: 'DELETE', cookie })).status).toBe(200);
    expect((await call(`/api/blobs/${hash}`)).status).toBe(401);
  }, 60_000);

  it('publishes a sample from an uploaded blob, lists it publicly, and removes it', async () => {
    const cookie = await signIn('samples@example.com');
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'digger' }) })).status).toBe(200);
    const snd = new TextEncoder().encode('a whole record, honest');
    const hash = await sha256Hex(snd);
    const body = { hash, title: 'Old 78 Break', description: 'Drums from a 1930s side.', source: 'archive.org/details/example', tags: ['78rpm', 'Break'], license: 'CC0', durationMs: 12_345, rate: 44100, channels: 2, peaks: [0.1, 0.5, 1.2, -1], rights: true };
    // needs the blob, the rights box, a known licence, and a sane length
    let r = await call('/api/samples', { method: 'POST', cookie, ...json(body) });
    expect(r.status).toBe(409);
    expect((await call(`/api/blobs/${hash}`, { method: 'POST', cookie, body: snd })).status).toBe(200);
    expect((await call('/api/samples', { method: 'POST', cookie, ...json({ ...body, rights: false }) })).status).toBe(400);
    expect((await call('/api/samples', { method: 'POST', cookie, ...json({ ...body, license: 'MIT' }) })).status).toBe(400);
    expect((await call('/api/samples', { method: 'POST', cookie, ...json({ ...body, durationMs: 10 * 60 * 1000 }) })).status).toBe(413);
    expect((await call(`/api/blobs/${hash}`)).status).toBe(401);
    r = await call('/api/samples', { method: 'POST', cookie, ...json(body) });
    const pubText = await r.text();
    expect(r.status, pubText).toBe(200);
    const pub = JSON.parse(pubText) as { id: string; slug: string };
    expect(pub.slug).toBe('digger-old-78-break');

    // public listing with peaks clamped, search by source, blob now public
    let list = await (await call('/api/samples')).json() as { samples: { slug: string; peaks: number[]; tags: string[]; durationMs: number; channels: number; bytes: number; handle: string }[] };
    expect(list.samples.length).toBe(1);
    expect(list.samples[0].peaks).toEqual([0.1, 0.5, 1, 0]);
    expect(list.samples[0].tags).toEqual(['78rpm', 'break']);
    expect(list.samples[0].durationMs).toBe(12345);
    expect(list.samples[0].channels).toBe(2);
    expect(list.samples[0].bytes).toBe(snd.byteLength);
    expect(list.samples[0].handle).toBe('digger');
    list = await (await call('/api/samples?q=archive.org')).json() as typeof list;
    expect(list.samples.length).toBe(1);
    list = await (await call('/api/samples?tag=jazz')).json() as typeof list;
    expect(list.samples.length).toBe(0);
    expect((await call(`/api/blobs/${hash}`)).status).toBe(200);
    expect((await call(`/api/samples/${pub.slug}/download`, { method: 'POST' })).status).toBe(200);
    expect(((await (await call(`/api/samples/${pub.slug}`)).json()) as { downloads: number }).downloads).toBe(1);
    expect(((await (await call('/api/samples/mine', { cookie })).json()) as { samples: unknown[] }).samples.length).toBe(1);

    // remove: gone from the library, blob private again; deleting the account cleans up too
    expect((await call(`/api/samples/${pub.id}`, { method: 'DELETE', cookie })).status).toBe(200);
    expect((await call(`/api/blobs/${hash}`)).status).toBe(401);
    r = await call('/api/samples', { method: 'POST', cookie, ...json(body) });
    expect((await r.json() as { slug: string }).slug).toBe('digger-old-78-break');
    expect((await call('/api/me', { method: 'DELETE', cookie })).status).toBe(200);
    expect(((await (await call('/api/samples')).json()) as { samples: unknown[] }).samples.length).toBe(0);
    expect(await env.BLOBS.get(`blobs/${hash}`)).toBeNull();
  }, 60_000);

  it('publishes a beat with its preview and card, serves it publicly, counts plays and likes, records remix lineage', async () => {
    const cookie = await signIn('beatmaker@example.com');
    expect((await call('/api/me', { method: 'PUT', cookie, ...json({ handle: 'maker' }) })).status).toBe(200);
    const snd = new TextEncoder().encode('a kick'); const hash = await sha256Hex(snd);
    const mp3 = new TextEncoder().encode('mp3 bytes'); const previewHash = await sha256Hex(mp3);
    const png = new TextEncoder().encode('png bytes'); const coverHash = await sha256Hex(png);
    const manifest = { kind: 'CHOPDECK-MANIFEST', version: 1, title: 'First Beat', masterTempo: 93, machine: { sounds: [{ id: 's1', name: 'KICK' }] }, blobs: { s1: hash } };
    const body = { manifest, previewHash, coverHash, title: 'First Beat', description: 'Two bars.', tags: ['boom-bap'], license: 'CC-BY', source: { kind: 'sequence', index: 0 }, bpm: 93, durationMs: 5200, peaks: [0.2, 0.9] };
    // everything must be uploaded first
    let r = await call('/api/beats', { method: 'POST', cookie, ...json(body) });
    expect(r.status).toBe(409);
    for (const [h, b, mime] of [[hash, snd, 'application/zip'], [previewHash, mp3, 'audio/mpeg'], [coverHash, png, 'image/png']] as const) expect((await call(`/api/blobs/${h}`, { method: 'POST', cookie, body: b, headers: { 'content-type': mime } })).status).toBe(200);
    r = await call('/api/beats', { method: 'POST', cookie, ...json(body) });
    const pubText = await r.text();
    expect(r.status, pubText).toBe(200);
    const pub = JSON.parse(pubText) as { id: string; slug: string; url: string };
    expect(pub.url).toBe('/beats/maker/first-beat');
    expect((await JSON.parse(await (await call('/api/beats', { method: 'POST', cookie, ...json(body) })).text()) as { slug: string }).slug).toBe('first-beat-2');

    // public: feed, page data, manifest, blobs (sounds, preview, cover), plays
    let feed = await (await call('/api/beats?sort=new')).json() as { beats: { slug: string; handle: string; url: string; parent: unknown; previewHash: string; peaks: number[] }[] };
    expect(feed.beats.map(b => b.slug)).toEqual(['first-beat-2', 'first-beat']);
    expect(feed.beats[0].handle).toBe('maker');
    expect(feed.beats[1].peaks).toEqual([0.2, 0.9]);
    feed = await (await call('/api/beats?handle=maker&q=two')).json() as typeof feed;
    expect(feed.beats.length).toBe(2);
    feed = await (await call('/api/beats?handle=nobody')).json() as typeof feed;
    expect(feed.beats.length).toBe(0);
    const page = await (await call('/api/beats/maker/first-beat')).json() as { title: string; liked: boolean; remixList: unknown[]; license: string };
    expect(page.title).toBe('First Beat'); expect(page.liked).toBe(false); expect(page.remixList).toEqual([]);
    const man = await (await call('/api/beats/maker/first-beat/manifest')).json() as { id: string; manifest: { blobs: Record<string, string> } };
    expect(man.manifest.blobs.s1).toBe(hash);
    for (const h of [hash, previewHash, coverHash]) expect((await call(`/api/blobs/${h}`)).status).toBe(200);
    expect((await call('/api/beats/maker/first-beat/play', { method: 'POST' })).status).toBe(200);
    expect(((await (await call('/api/beats/by-id/' + pub.id)).json()) as { plays: number }).plays).toBe(1);
    expect((await call('/api/beats/maker/nope')).status).toBe(404);

    // likes toggle and need a session
    expect((await call('/api/beats/maker/first-beat/like', { method: 'POST' })).status).toBe(401);
    const fan = await signIn('fan@example.com');
    expect(await (await call('/api/beats/maker/first-beat/like', { method: 'POST', cookie: fan })).json()).toEqual({ liked: true, likes: 1 });
    expect(((await (await call('/api/beats/maker/first-beat', { cookie: fan })).json()) as { liked: boolean }).liked).toBe(true);
    expect(await (await call('/api/beats/maker/first-beat/like', { method: 'POST', cookie: fan })).json()).toEqual({ liked: false, likes: 0 });

    // a remix by the fan: the sound is the maker's but public through the beat, lineage recorded, parent counted
    expect((await call('/api/me', { method: 'PUT', cookie: fan, ...json({ handle: 'fan' }) })).status).toBe(200);
    const mp3b = new TextEncoder().encode('remix mp3'); const previewB = await sha256Hex(mp3b);
    expect((await call(`/api/blobs/${previewB}`, { method: 'POST', cookie: fan, body: mp3b, headers: { 'content-type': 'audio/mpeg' } })).status).toBe(200);
    r = await call('/api/beats', { method: 'POST', cookie: fan, ...json({ ...body, previewHash: previewB, coverHash: undefined, title: 'First Beat (flip)', parentBeat: pub.id }) });
    expect(r.status, await r.clone().text()).toBe(200);
    const rmx = await r.json() as { url: string };
    expect(rmx.url).toBe('/beats/fan/first-beat-flip');
    const parentNow = await (await call('/api/beats/maker/first-beat')).json() as { remixes: number; remixList: { url: string }[] };
    expect(parentNow.remixes).toBe(1);
    expect(parentNow.remixList[0].url).toBe('/beats/fan/first-beat-flip');
    expect(((await (await call('/api/beats/fan/first-beat-flip')).json()) as { parent: { url: string } }).parent.url).toBe('/beats/maker/first-beat');
    // a sound that is nobody's public is refused with its name
    const secret = new TextEncoder().encode('secret sound'); const secretHash = await sha256Hex(secret);
    expect((await call(`/api/blobs/${secretHash}`, { method: 'POST', cookie, body: secret })).status).toBe(200);
    r = await call('/api/beats', { method: 'POST', cookie: fan, ...json({ ...body, previewHash: previewB, manifest: { ...manifest, machine: { sounds: [{ id: 'x', name: 'SECRET' }] }, blobs: { x: secretHash } }, title: 'Stolen' }) });
    expect(r.status).toBe(403);
    expect((await r.json() as { blocked: string[] }).blocked).toEqual(['SECRET']);

    // owner removes; the stranger cannot
    expect((await call(`/api/beats/${pub.id}`, { method: 'DELETE', cookie: fan })).status).toBe(404);
    expect((await call(`/api/beats/${pub.id}`, { method: 'DELETE', cookie })).status).toBe(200);
    expect((await call('/api/beats/maker/first-beat')).status).toBe(404);
    expect(((await (await call('/api/beats/fan/first-beat-flip')).json()) as { parent: unknown }).parent).toBeNull();
  }, 60_000);

  it('curates through the admin routes with a token', async () => {
    env.ADMIN_TOKEN = 'a-long-enough-admin-token';
    const auth = { authorization: `Bearer ${env.ADMIN_TOKEN}` };
    const snd = new TextEncoder().encode('a public domain 78');
    const hash = await sha256Hex(snd);
    expect((await call(`/api/admin/blobs/${hash}`, { method: 'POST', body: snd })).status).toBe(401);
    expect((await call(`/api/admin/blobs/${hash}`, { method: 'POST', body: snd, headers: { authorization: 'Bearer wrong-token-wrong-token' } })).status).toBe(401);
    expect((await call(`/api/admin/blobs/${hash}?license=PD`, { method: 'POST', body: snd, headers: auth })).status).toBe(200);
    let r = await call('/api/admin/samples', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ hash, title: 'Africa', description: 'Original Memphis Five, 1924.', source: 'https://archive.org/details/x', tags: ['78rpm', 'jazz'], license: 'PD', durationMs: 180000, rate: 44100, channels: 1, peaks: [0.5], featured: true, slug: 'africa_original-memphis-five' }) });
    expect(r.status, await r.clone().text()).toBe(200);
    const pub = await r.json() as { id: string; slug: string };
    expect(pub.slug).toBe('chopdeck-africa-original-memphis-five');
    const list = await (await call('/api/samples')).json() as { samples: { slug: string; handle: string | null; featured: boolean; license: string }[] };
    const mine = list.samples.find(s => s.slug === pub.slug)!;
    expect(mine.handle).toBeNull();
    expect(mine.featured).toBe(true);
    expect(mine.license).toBe('PD');
    expect(list.samples[0].slug).toBe(pub.slug); // featured sorts first
    expect((await call(`/api/blobs/${hash}`)).status).toBe(200);
    // flag and unlist
    expect((await call(`/api/admin/samples/${pub.slug}`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ takedown: true }) })).status).toBe(200);
    expect((await call(`/api/samples/${pub.slug}`)).status).toBe(404);
    expect((await call(`/api/blobs/${hash}`)).status).toBe(401);
    const all = await (await call('/api/admin/samples', { headers: auth })).json() as { items: { slug: string; takedown: number }[] };
    expect(all.items.find(i => i.slug === pub.slug)?.takedown).toBe(1);
    expect((await call(`/api/admin/samples/${pub.id}`, { method: 'DELETE', headers: auth })).status).toBe(200);
    delete env.ADMIN_TOKEN;
  }, 30_000);

  it('enforces the quota', async () => {
    const cookie = await signIn('quota@example.com');
    const big = new Uint8Array(1024);
    const hash = await sha256Hex(big);
    // shrink the quota for this test by pretending the user already used almost all of it
    await env.DB.prepare('INSERT INTO blobs (hash, bytes, mime, uploader_id) VALUES (?, ?, ?, (SELECT id FROM user WHERE email = ?))').bind('f'.repeat(64), 250 * 1024 * 1024 - 100, 'x', 'quota@example.com').run();
    const r = await call(`/api/blobs/${hash}`, { method: 'POST', cookie, body: big });
    expect(r.status).toBe(507);
  }, 30_000);
});
