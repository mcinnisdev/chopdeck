import { test, expect } from '@playwright/test';

test("the owner's manual is reachable and controls show tooltips that point into it", async ({ page }) => {
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01');
  // the LCD fits its 48 columns inside the glass: the last column of row 0 ends before the glass edge
  const glass = await lcd.boundingBox();
  const width = await page.evaluate(() => { const r = document.querySelector('[role=region][aria-label=LCD] > div'); return r ? (r as HTMLElement).scrollWidth : 0; });
  expect(width).toBeLessThanOrEqual(Math.ceil(glass!.width));

  const rec = await page.getByRole('button', { name: 'REC' }).boundingBox();
  await page.mouse.move(rec!.x + rec!.width / 2, rec!.y + rec!.height / 2, { steps: 5 });
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Arm recording');
  await expect(tip).toContainText('#recording');

  const manual = await page.context().newPage();
  await manual.goto('/manual/#recording');
  await expect(manual.locator('h1').first()).toContainText('Introduction');
  await expect(manual.locator('#recording')).toContainText('Recording and overdubbing');
  await expect(manual.locator('#keyboard')).toContainText('Computer keyboard');
});
