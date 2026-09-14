// EZ's two destructive edges, held down by tests: the red button must never quietly eat a pattern, and a
// pad tap must never quietly rewrite the kit. Both shipped broken once; these are the cases that caught it.
import { test, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

function wav(secs = 2): Buffer {
  const rate = 22050, n = Math.floor(rate * secs);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

async function notes(ez: Locator): Promise<number> {
  const txt = await ez.getByText(/\d+ notes\./).innerText();
  return Number(txt.match(/(\d+) notes/)![1]);
}

test('VERIFY: Rec no longer eats the pattern, and punches out without stopping', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  const rec = ez.getByRole('button', { name: 'Rec', exact: true });
  const play = ez.getByRole('button', { name: 'Play', exact: true });
  await ez.getByRole('button', { name: 'Sequence' }).click();
  const start = await notes(ez);
  expect(start).toBeGreaterThan(0);

  await rec.click();
  await page.waitForTimeout(6000);              // more than one full pass of the 2-bar pattern
  expect(await notes(ez)).toBe(start);          // nothing was erased
  expect(await play.getAttribute('aria-pressed')).toBe('true');   // the transport reads as rolling

  // Rec again punches out but keeps playing
  await rec.click();
  expect(await rec.getAttribute('aria-pressed')).toBe('false');
  expect(await play.getAttribute('aria-pressed')).toBe('true');
  const afterPunch = await notes(ez);
  const pads = ez.getByRole('region', { name: 'Pads' });
  for (const n of ['Pad 1', 'Pad 2', 'Pad 3']) { await pads.getByRole('button', { name: new RegExp(`^${n}[:,]`) }).click(); await page.waitForTimeout(150); }
  await page.waitForTimeout(300);
  expect(await notes(ez)).toBe(afterPunch);     // pads after punch-out do not record
  await ez.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('VERIFY: recording still records when it is armed', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await ez.getByRole('button', { name: 'Sequence' }).click();
  await ez.getByRole('button', { name: 'Clear' }).click();
  expect(await notes(ez)).toBe(0);
  await ez.getByRole('button', { name: 'Rec', exact: true }).click();
  const pads = ez.getByRole('region', { name: 'Pads' });
  for (const n of ['Pad 1', 'Pad 2', 'Pad 3']) { await pads.getByRole('button', { name: new RegExp(`^${n}[:,]`) }).click(); await page.waitForTimeout(200); }
  await page.waitForTimeout(300);
  await ez.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(await notes(ez)).toBeGreaterThanOrEqual(3);
});

test('VERIFY: pads play in the Chop panel until Put on pads is armed', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  const pads = ez.getByRole('region', { name: 'Pads' });
  await ez.getByRole('button', { name: 'Library' }).click();
  await ez.locator('input[aria-label="Add sounds"]').setInputFiles({ name: 'break.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(ez.getByRole('heading', { name: 'Chop' })).toBeVisible({ timeout: 15_000 });

  // the kit's own pads are untouched by a tap while not armed
  const before = await pads.getByRole('button', { name: /^Pad 1[:,]/ }).getAttribute('aria-label');
  await pads.getByRole('button', { name: /^Pad 1[:,]/ }).click();
  expect(await pads.getByRole('button', { name: /^Pad 1[:,]/ }).getAttribute('aria-label')).toBe(before);
  expect(before).toContain('KICK');

  // opening a sound must not silently chop it: the kit sounds still carry one zone
  await ez.getByLabel('Sound to chop').selectOption({ label: 'KICK' });
  await expect(ez.getByText(/8 chops\./)).toBeVisible();     // shown as a suggestion
  await ez.getByLabel('Sound to chop').selectOption({ label: 'BREAK' });

  // arm, then tap: the chop lands and the selection walks on
  await ez.getByRole('button', { name: '4 slices' }).click();
  await ez.getByRole('button', { name: 'Put on pads' }).click();
  await expect(ez.getByRole('button', { name: 'Put on pads' })).toHaveAttribute('aria-pressed', 'true');
  await pads.getByRole('button', { name: /^Pad 5[:,]/ }).click();
  await expect(pads.getByRole('button', { name: /^Pad 5: BREAK1/ })).toBeVisible();
  await pads.getByRole('button', { name: /^Pad 6[:,]/ }).click();
  await expect(pads.getByRole('button', { name: /^Pad 6: BREAK2/ })).toBeVisible();

  // placing the same chop repeatedly must not pile up sounds in memory
  await ez.getByRole('button', { name: 'Library' }).click();
  const n1 = Number((await ez.getByText(/Your sounds · \d+/).innerText()).match(/(\d+)/)![1]);
  await ez.getByRole('button', { name: 'Chop', exact: true }).click();
  await ez.getByRole('button', { name: 'Put on pads' }).click();
  for (const p of ['Pad 9', 'Pad 10', 'Pad 11', 'Pad 12']) { await pads.getByRole('button', { name: new RegExp(`^${p}[:,]`) }).click(); }
  await ez.getByRole('button', { name: 'Library' }).click();
  const n2 = Number((await ez.getByText(/Your sounds · \d+/).innerText()).match(/(\d+)/)![1]);
  expect(n2 - n1).toBeLessThanOrEqual(4);   // four taps, and only chops we had not cut before are new
});

test('VERIFY: All to pads keeps the chopper on the break', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await ez.getByRole('button', { name: 'Library' }).click();
  await ez.locator('input[aria-label="Add sounds"]').setInputFiles({ name: 'break.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(ez.getByRole('heading', { name: 'Chop' })).toBeVisible({ timeout: 15_000 });
  await ez.getByRole('button', { name: '8 slices' }).click();
  await ez.getByRole('button', { name: 'All to pads' }).click();
  await expect(ez.getByLabel('Sound to chop').locator('option:checked')).toHaveText('BREAK');
  await expect(ez.getByText(/8 chops\./)).toBeVisible();
});
