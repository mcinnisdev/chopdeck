import { test, expect, type Browser, type BrowserContext } from '@playwright/test';

// Accounts end to end against the local API (wrangler pages dev + local D1/R2): magic-link sign-in,
// handle, the machine syncing on its own, a second browser pulling the project, account deletion.
// Needs the API on :8788; playwright.config.ts starts it.

const email = `e2e-${Date.now()}@example.com`;
const handle = `e2e-${Date.now().toString(36)}`;

async function signIn(ctx: BrowserContext, address: string) {
  const page = await ctx.newPage();
  await page.goto('/account/');
  await expect(page.locator('#signed-out')).toBeVisible();
  await page.fill('#email', address);
  await page.getByRole('button', { name: 'Send me a sign-in link' }).click();
  await expect(page.locator('#sent').or(page.locator('#signin-error:not([hidden])'))).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#signin-error')).toBeHidden();
  const link = page.locator('#devlink-a');
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute('href'))!);
  await expect(page.locator('#signed-in')).toBeVisible();
  return page;
}

test('sign in, sync from the machine, pull on another browser, delete', async ({ browser }: { browser: Browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const a = await signIn(ctxA, email);
  await expect(a.locator('#email-out')).toHaveText(email);
  await expect(a.locator('#handle-box')).toBeVisible();
  await a.fill('#handle', handle);
  await a.getByRole('button', { name: 'Save handle' }).click();
  await expect(a.locator('#handle-out')).toHaveText(`@${handle}`);
  await expect(a.locator('#no-project')).toBeVisible();

  // the machine: signed in, it pushes a few seconds after a change
  await a.goto('/');
  const lcd = a.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01-First Beat');
  const link = a.locator('a[href="/account/"]');
  await expect(link).toContainText(`@${handle.toUpperCase()}`);
  await a.evaluate(() => { const fw = (window as unknown as { chopdeck: { m: { sequences: { name: string }[] }; touch(): void } }).chopdeck; fw.m.sequences[0].name = 'Synced Beat'; fw.touch(); });
  await expect(link).toHaveAttribute('data-sync', 'synced', { timeout: 30_000 });
  await expect(link).toContainText('SYNCED');

  // the account page now lists the project
  await a.goto('/account/');
  await expect(a.locator('#project-line')).toContainText('Synced Beat');
  await expect(a.locator('#revs')).toContainText('current');

  // publish the starter program as a kit, find it in the library, send it back to the machine
  await a.goto('/kits/publish/?pgm=0');
  await expect(a.locator('#form-box')).toBeVisible();
  await expect(a.locator('#title')).toHaveValue('STARTER');
  await a.fill('#tags', 'e2e, Starter');
  await a.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(a.locator('#done')).toBeVisible({ timeout: 60_000 });
  await expect(a.locator('#mine')).toContainText('STARTER');
  await a.goto('/kits/');
  const kit = a.locator(`#${handle}-starter`);
  await expect(kit).toBeVisible();
  await expect(kit).toContainText(`@${handle}`);
  await expect(kit).toContainText('#e2e');
  await expect(kit.locator('.pad').filter({ hasText: 'KICK' })).toHaveCount(1);
  await kit.getByRole('button', { name: 'Send to machine' }).click();
  await a.waitForURL(/\/(\?handoff=1)?$/);
  await expect(a.getByRole('region', { name: 'LCD' })).toContainText('STARTER.PGM', { timeout: 30_000 });
  await expect(a.getByRole('region', { name: 'LCD' })).toContainText('Load');

  // publish one of the machine's sounds as a sample, find it, send it back: the Load a Sound window opens
  await a.goto('/samples/publish/');
  await expect(a.locator('#form-box')).toBeVisible();
  await a.locator('.src').filter({ hasText: 'KICK' }).first().click();
  await expect(a.locator('#title')).toHaveValue(/KICK/);
  await a.fill('#tags', 'e2e, drums');
  await a.fill('#source', 'synthesised on the machine');
  await a.check('#rights');
  await a.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(a.locator('#done')).toBeVisible({ timeout: 60_000 });
  await a.goto('/samples/');
  const smp = a.locator('article.smp').filter({ hasText: `@${handle}` }).first();
  await expect(smp).toBeVisible();
  await expect(smp).toContainText('#e2e');
  await expect(smp.locator('canvas.wave')).toBeVisible();
  await smp.getByRole('button', { name: 'Send to machine' }).click();
  await a.waitForURL(/\/(\?handoff=1)?$/);
  await expect(a.getByRole('region', { name: 'LCD' })).toContainText('Load a Sound', { timeout: 30_000 });

  // publish the synced sequence as a beat: rendered here, card drawn here, then a page with share tags
  await a.goto('/publish/');
  await expect(a.locator('#form-box')).toBeVisible({ timeout: 30_000 });
  await expect(a.locator('#title')).toHaveValue('Synced Beat');
  await a.fill('#tags', 'e2e, demo');
  await a.check('#rights');
  await a.getByRole('button', { name: 'Render and publish' }).click();
  await expect(a.locator('#done')).toBeVisible({ timeout: 120_000 });
  await expect(a.locator('#card')).toBeVisible();
  await expect(a.locator('#mine')).toContainText('Synced Beat');
  const beatUrl = `http://localhost:8788/beats/${handle}/synced-beat`;
  const html = await (await a.request.get(beatUrl)).text();
  expect(html).toContain(`<meta property="og:title" content="Synced Beat by @${handle}"`);
  expect(html).toContain('og:audio');
  expect(html).toContain('MusicRecording');
  // the beats feed lists it; the page plays and opens on the machine (the API and page live on :8788 in tests)
  const feed = await (await a.request.get('http://localhost:8788/api/beats?handle=' + handle)).json() as { beats: { slug: string; coverHash: string | null; previewHash: string }[] };
  expect(feed.beats.map(b => b.slug)).toEqual(['synced-beat']);
  expect(feed.beats[0].coverHash).toBeTruthy();
  expect((await a.request.get(`http://localhost:8788/api/blobs/${feed.beats[0].previewHash}`)).headers()['content-type']).toContain('audio/mpeg');
  await a.goto(beatUrl);
  await expect(a.locator('#title')).toHaveText('Synced Beat');
  await expect(a.locator('#cover')).toBeVisible();
  await expect(a.locator('#stats')).toContainText('0 plays');
  await a.getByRole('button', { name: 'Open on the machine' }).click();
  await a.waitForURL(/localhost:8788\/(\?handoff=1)?$/);
  await expect(a.getByRole('region', { name: 'LCD' })).toContainText('Load Project', { timeout: 30_000 });
  await expect(a.getByRole('region', { name: 'LCD' })).toContainText('SYNCED_BEAT.CHOPDECK');

  // a second browser: sign in, and the machine boots with the synced project
  const ctxB = await browser.newContext();
  const b = await signIn(ctxB, email);
  await expect(b.locator('#project-line')).toContainText('Synced Beat');
  await b.goto('/');
  await expect(b.getByRole('region', { name: 'LCD' })).toContainText('Sq:01-Synced Beat', { timeout: 30_000 });
  await expect(b.locator('a[href="/account/"]')).toContainText(`@${handle.toUpperCase()}`);

  // a stranger never sees the blobs
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  const res = await c.request.get('/api/project');
  expect(res.status()).toBe(401);

  // delete from B; A's next visit is signed out
  await b.goto('/account/');
  b.once('dialog', d => d.accept());
  await b.getByRole('button', { name: 'Delete account' }).click();
  await b.waitForURL(url => new URL(url).pathname === '/');
  await a.goto('/');
  await expect(a.locator('a[href="/account/"]')).toHaveText('SIGN IN');
  await ctxA.close(); await ctxB.close(); await ctxC.close();
});
