import { test, expect } from '@playwright/test';

const hoverCenter = async (page: import('@playwright/test').Page, box: { x: number; y: number; width: number; height: number }) =>
  page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });

test("the owner's manual is reachable and controls and soft keys show tooltips that point into it", async ({ page }) => {
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01');
  // the LCD fits its 48 columns inside the glass (once the LCD font has arrived)
  await page.evaluate(() => document.fonts.ready.then(() => document.fonts.load('100px VT323')));
  await page.waitForTimeout(300);
  const glass = await lcd.boundingBox();
  const width = await page.evaluate(() => { const r = document.querySelector('[role=region][aria-label=LCD] > div'); return r ? (r as HTMLElement).scrollWidth : 0; });
  expect(width).toBeLessThanOrEqual(Math.ceil(glass!.width));

  // a panel control
  await hoverCenter(page, (await page.getByRole('button', { name: 'REC' }).boundingBox())!);
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Arm recording');
  await expect(tip).toContainText('#recording');

  // a soft key on the LCD: TrMUTE is the third slot
  const softRow = lcd.locator('> div > div').nth(7);
  const slot = await softRow.locator('> span').nth(2).boundingBox();
  await page.mouse.move(10, 10);
  await hoverCenter(page, slot!);
  await expect(tip).toContainText('F3: TrMUTE');
  await expect(tip).toContainText('Mute or unmute');

  // TIPS OFF silences them and is remembered across a reload
  await page.getByRole('button', { name: /TIPS ON/ }).click();
  await page.mouse.move(10, 10);
  await hoverCenter(page, (await page.getByRole('button', { name: 'REC' }).boundingBox())!);
  await page.waitForTimeout(700);
  await expect(tip).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /TIPS OFF/ })).toBeVisible();
  await page.getByRole('button', { name: /TIPS OFF/ }).click();

  const manual = await page.context().newPage();
  await manual.goto('/manual/#recording');
  await expect(manual.locator('h1').first()).toContainText('Introduction');
  await expect(manual.locator('#recording')).toContainText('Recording and overdubbing');
  await expect(manual.locator('#keyboard')).toContainText('Computer keyboard');
});

test('fields on the LCD show tooltips, and the factory demo plays on first visit', async ({ page }) => {
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01-First Beat');
  // hover the Timing: value (row 1, around column 22)
  const row1 = lcd.locator('> div > div').nth(1);
  const box = (await row1.boundingBox())!;
  await page.mouse.move(box.x + box.width * (23 / 48), box.y + box.height / 2, { steps: 4 });
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('Timing: 1/16');
  await expect(tip).toContainText('quantise grid');
  // the demo plays
  await page.mouse.move(10, 10);
  await page.click('body');
  await page.keyboard.press('Home');
  await page.waitForTimeout(400);
  const peak = await page.evaluate(async () => { const a = (window as unknown as { chopdeckAudio: { level(): number } }).chopdeckAudio; let p = 0; for (let i = 0; i < 30; i++) { p = Math.max(p, a.level()); await new Promise(r => setTimeout(r, 20)); } return p; });
  expect(peak).toBeGreaterThan(0.02);
  await page.keyboard.press('F9');
});
