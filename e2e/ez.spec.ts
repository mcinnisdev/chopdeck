import { test, expect } from '@playwright/test';

// The EZ panel: the same machine behind a simpler front. What you change on EZ shows on OG's LCD.
test('EZ plays, sets tempo and pattern, and OG sees the same machine', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await expect(ez).toBeVisible();
  // pads carry the kit's sound names; the keyboard still plays them
  await expect(ez.getByRole('button', { name: /Pad 1: KICK/ })).toBeVisible();
  await page.keyboard.down('KeyZ');
  await expect(ez.getByRole('button', { name: /Pad 1: KICK/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');
  // transport
  await ez.getByRole('button', { name: 'Play' }).click();
  await expect(ez.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
  await ez.getByRole('button', { name: 'Stop' }).click();
  await expect(ez.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
  // tempo and pattern
  await ez.getByLabel('Tempo').fill('100');
  await ez.getByLabel('Tempo').press('Enter');
  await ez.getByRole('button', { name: /Pattern 2/ }).click();
  await expect(ez.getByRole('button', { name: /Pattern 2/ })).toHaveAttribute('aria-pressed', 'true');
  // the OG panel shows the same machine: sequence 2 selected; back on 1, the tempo we set
  await ez.getByRole('button', { name: 'OG' }).click();
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:02');
  await page.getByRole('button', { name: 'EZ' }).click();
  await ez.getByRole('button', { name: /Pattern 1/ }).click();
  await ez.getByRole('button', { name: 'OG' }).click();
  await expect(lcd).toContainText('100.0');
  // the choice is remembered
  await page.reload();
  await expect(page.getByRole('region', { name: 'LCD' })).toBeVisible();
  await page.getByRole('button', { name: 'EZ' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
});

test('a phone-sized first visit starts on EZ', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
  await ctx.close();
});
