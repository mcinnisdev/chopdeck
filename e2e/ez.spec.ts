import { test, expect } from '@playwright/test';

function wav(): Buffer {
  const rate = 22050, n = Math.floor(rate * 0.2);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

// The EZ panel: the same machine behind the refreshed front. What you do on EZ shows on OG's LCD.
test('EZ: transport, sequence grid and pattern; OG sees the same machine', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await expect(ez).toBeVisible();
  const flip = () => page.getByRole('switch', { name: 'EZ mode' }).click();
  // pads carry the kit's sound names; the keyboard still plays them
  const pads = ez.getByRole('region', { name: 'Pads' });
  const pad1 = pads.getByRole('button', { name: 'Pad 1: KICK' });
  await expect(pad1).toBeVisible();
  await page.keyboard.down('KeyZ');
  await expect(pad1).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');
  // transport
  await ez.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(ez.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await ez.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(ez.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // the sequence panel: pattern 3, the grid, place hits, undo one
  await ez.getByRole('button', { name: 'Sequence' }).click();
  const patterns = ez.getByRole('group', { name: 'Patterns' });
  await patterns.getByRole('button', { name: '3', exact: true }).click();
  await expect(patterns.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const grid = ez.getByRole('grid', { name: 'Step sequencer' });
  await expect(grid).toBeVisible();
  const cell = grid.getByRole('gridcell', { name: /^1 .* step 1$/ });
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await ez.getByRole('button', { name: 'Undo' }).click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await cell.click();
  await grid.getByRole('gridcell', { name: /^1 .* step 9$/ }).click();
  // OG shows the same machine: sequence 3 with two notes
  await flip();
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:03');
  await expect(lcd).toContainText('2 notes');
  // the panel choice is remembered across a reload
  await flip();
  await page.reload();
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Step sequencer' })).toBeVisible();
});

test('EZ: add a sound, chop it, put chops on pads, name the kit; OG has it all', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await ez.getByRole('button', { name: 'Library' }).click();
  await ez.locator('input[aria-label="Add sounds"]').setInputFiles({ name: 'tone_a4.wav', mimeType: 'audio/wav', buffer: wav() });
  // adding a file opens Chop on it
  await expect(ez.getByRole('heading', { name: 'Chop' })).toBeVisible({ timeout: 15_000 });
  await expect(ez.getByLabel('Sound to chop').locator('option:checked')).toHaveText('TONE_A4');
  await ez.getByRole('button', { name: '4 slices' }).click();
  await expect(ez.getByRole('slider', { name: 'Chop 3 start' })).toBeVisible();
  await expect(ez.getByRole('slider', { name: 'Chop 5 start' })).toHaveCount(0);
  // select chop 2 and tap pad 13: the slice lands there
  await ez.getByRole('slider', { name: 'Chop 2 start' }).click();
  const pads = ez.getByRole('region', { name: 'Pads' });
  await pads.getByRole('button', { name: 'Pad 13, empty' }).click();
  await expect(pads.getByRole('button', { name: 'Pad 13: TONE_A42' })).toBeVisible();
  // all chops onto the pads from pad 1
  await ez.getByRole('button', { name: 'All to pads' }).click();
  await expect(pads.getByRole('button', { name: 'Pad 1: TONE_A41' })).toBeVisible();
  await expect(pads.getByRole('button', { name: 'Pad 4: TONE_A44' })).toBeVisible();
  // the mixer: rename the kit; OG's PROGRAM screen shows it on DRUM1
  await ez.getByRole('button', { name: 'Mix' }).click();
  await ez.getByLabel('Kit name').fill('MY CHOPS');
  await ez.getByLabel('Kit name').press('Enter');
  await page.getByRole('switch', { name: 'EZ mode' }).click();
  await page.keyboard.down('Shift'); await page.keyboard.press('Digit6'); await page.keyboard.up('Shift');
  await expect(page.getByRole('region', { name: 'LCD' })).toContainText('MY CHOPS');
});

test('a phone-sized first visit starts on EZ with the pads under the panel', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
  const nav = await page.getByRole('navigation', { name: 'Panels' }).boundingBox();
  const pads = await page.getByRole('region', { name: 'Pads' }).boundingBox();
  expect(pads!.y).toBeGreaterThan(nav!.y);
  await ctx.close();
});
