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
  env = { DB, BLOBS, SITE_URL: SITE, BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-1234', DEV_MAGIC_LINKS: '1' };
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
