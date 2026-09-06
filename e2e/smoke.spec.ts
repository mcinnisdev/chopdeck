import { test, expect } from '@playwright/test';

test('the machine boots to the MAIN screen and responds to keys', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01-First Beat');
  await expect(lcd).toContainText('Now:001.01.00');
  // SHIFT + 5 on the keypad -> TRIM
  await page.getByRole('button', { name: 'SHIFT' }).dispatchEvent('pointerdown', { button: 0, pointerId: 1 });
  await page.getByRole('button', { name: 'TRIM' }).click();
  await page.getByRole('button', { name: 'SHIFT' }).dispatchEvent('pointerup', { button: 0, pointerId: 1 });
  await expect(lcd).toContainText('TRIM');
  await page.getByRole('button', { name: 'MAIN SCREEN' }).click();
  await expect(lcd).toContainText('Sq:01');
  // keyboard: bracket turns the DATA wheel
  await page.keyboard.press('BracketRight');
  await expect(lcd).toContainText('Sq:02');
  await page.screenshot({ path: 'test-results/main.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('keyboard pads light up while held', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('region', { name: 'LCD' }).waitFor();
  await page.click('body');
  const pad1 = page.getByRole('button', { name: 'PAD 1', exact: true });
  await expect(pad1).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.down('KeyZ');
  await expect(pad1).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');
  await expect(pad1).toHaveAttribute('aria-pressed', 'false');
  // top row: 1 = pad 13
  await page.keyboard.down('Digit1');
  await expect(page.getByRole('button', { name: 'PAD 13', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Digit1');
});

test('served without the site behind it, the machine hides the site links and still runs', async ({ page }) => {
  // a fork or a local copy: /api answers like a static host would
  await page.route('**/api/**', r => r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' }));
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01-First Beat');
  await expect(page.locator('a[href="/account/"]')).toHaveCount(0);
  await expect(page.locator('a[href="/kits/"]')).toHaveCount(0);
  await expect(page.locator('a[href="/publish/"]')).toHaveCount(0);
  await expect(page.locator('a[href="https://mcinnis.dev"]')).toBeVisible();
  await page.keyboard.down('KeyZ');
  await expect(page.getByRole('button', { name: 'PAD 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');
});
