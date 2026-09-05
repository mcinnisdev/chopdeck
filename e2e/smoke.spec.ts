import { test, expect } from '@playwright/test';

test('the machine boots to the MAIN screen and responds to keys', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01-(Sequence01)');
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
