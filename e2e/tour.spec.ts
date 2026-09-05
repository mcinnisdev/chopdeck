import { test, expect } from '@playwright/test';

// a first-time visitor: no remembered tour state
test.use({ storageState: { cookies: [], origins: [] } });

test('the quick start tour opens on the first visit, walks the panel, and can be reopened from the header', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'LCD' })).toContainText('Sq:01');
  const tour = page.getByRole('dialog', { name: 'Quick start' });
  await expect(tour).toBeVisible();
  await expect(tour).toContainText('step 1 of');
  await expect(tour).toContainText('Welcome to Chop Deck');

  // the machine stays live underneath: the pads still play from the keyboard
  await page.keyboard.down('KeyZ');
  await expect(page.getByRole('button', { name: 'PAD 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');

  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('step 2 of');
  await expect(tour).toContainText('Z X C V');
  for (let i = 0; i < 4; i++) await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('Bring your own sounds');
  await expect(tour).toContainText('drop them anywhere');
  await expect(tour.getByRole('link', { name: /Manual/ })).toHaveAttribute('href', /#loading$/);
  await tour.getByRole('button', { name: 'Back' }).click();
  await expect(tour).toContainText('step 5 of');

  // Escape closes it and it stays closed after a reload
  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('region', { name: 'LCD' })).toContainText('Sq:01');
  await expect(tour).toHaveCount(0);

  // ...until asked for again
  await page.getByRole('button', { name: 'QUICK START' }).click();
  await expect(tour).toContainText('step 1 of');
  await tour.getByRole('button', { name: 'Skip' }).click();
  await expect(tour).toHaveCount(0);
});

test('the manual carries the quick start guide', async ({ page }) => {
  await page.goto('/manual/#quick-start');
  await expect(page.locator('#quick-start')).toHaveText('Quick start guide');
  await expect(page.locator('ol.steps li')).toHaveCount(10);
});
