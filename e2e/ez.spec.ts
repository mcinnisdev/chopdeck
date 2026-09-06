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

// The EZ panel: the same machine behind a simpler front. What you change on EZ shows on OG's LCD.
test('EZ plays, sets tempo and pattern, and OG sees the same machine', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await expect(ez).toBeVisible();
  const toOg = () => page.getByRole('switch', { name: 'EZ mode' }).click();
  // pads carry the kit's sound names; the keyboard still plays them
  await expect(ez.getByRole('button', { name: /Pad 1: KICK/ })).toBeVisible();
  await page.keyboard.down('KeyZ');
  await expect(ez.getByRole('button', { name: /Pad 1: KICK/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('KeyZ');
  // transport
  await ez.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(ez.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await ez.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(ez.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // tempo and pattern
  await ez.getByLabel('Tempo').fill('100');
  await ez.getByLabel('Tempo').press('Enter');
  await ez.getByRole('button', { name: /Pattern 2/ }).click();
  await expect(ez.getByRole('button', { name: /Pattern 2/ })).toHaveAttribute('aria-pressed', 'true');
  // the OG panel shows the same machine: sequence 2 selected; back on 1, the tempo we set
  await toOg();
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:02');
  await page.getByRole('switch', { name: 'EZ mode' }).click();
  await ez.getByRole('button', { name: /Pattern 1/ }).click();
  await toOg();
  await expect(lcd).toContainText('100.0');
  // the choice is remembered
  await page.reload();
  await expect(page.getByRole('region', { name: 'LCD' })).toBeVisible();
  await page.getByRole('switch', { name: 'EZ mode' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
});

test('EZ adds a sound, puts it on a pad, chops a break into a new kit, and OG has it all', async ({ page }) => {
  await page.goto('/?panel=ez');
  const ez = page.getByRole('region', { name: 'EZ panel' });
  await expect(ez).toBeVisible();
  // add a file: it appears in the sounds list
  await ez.getByLabel('Add sounds').setInputFiles({ name: 'tone_a4.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(ez.getByRole('button', { name: 'Put TONE_A4 on a pad' })).toBeVisible({ timeout: 15_000 });
  // put it on an empty pad
  await ez.getByRole('button', { name: 'Put TONE_A4 on a pad' }).click();
  await expect(ez.getByRole('status').filter({ hasText: 'Tap a pad' })).toContainText('Tap a pad for TONE_A4');
  await ez.getByRole('button', { name: 'Pad 13, empty' }).click();
  await expect(ez.getByRole('button', { name: 'Pad 13: TONE_A4' })).toBeVisible();
  // edit pads: clear it again through the pad editor
  await ez.getByRole('button', { name: 'Edit pads' }).click();
  await ez.getByRole('button', { name: 'Pad 13: TONE_A4' }).click();
  await expect(ez.getByRole('dialog', { name: 'Pad 13' })).toBeVisible();
  await ez.getByRole('button', { name: 'Clear' }).click();
  await expect(ez.getByRole('button', { name: 'Pad 13, empty' })).toBeVisible();
  await ez.getByRole('button', { name: 'Done' }).click();
  await ez.getByRole('button', { name: 'Edit pads' }).click();
  // chop the demo break into eight slices on a new kit
  await ez.getByRole('button', { name: 'Chop BREAK 93', exact: true }).click();
  const chop = ez.getByRole('dialog', { name: 'Chop BREAK 93', exact: true });
  await expect(chop).toBeVisible();
  await chop.getByRole('button', { name: '8 slices' }).click();
  await chop.getByRole('button', { name: 'Put on pads in a new kit' }).click();
  await expect(ez.getByLabel('Kit name')).toHaveValue('BREAK 93');
  await expect(ez.getByRole('button', { name: /Pad 1: BREAK 931/ })).toBeVisible();
  await expect(ez.getByRole('button', { name: /Pad 8: BREAK 938/ })).toBeVisible();
  await expect(ez.getByRole('button', { name: 'Pad 9, empty' })).toBeVisible();
  // rename the kit; OG's PROGRAM screen shows it on DRUM1
  await ez.getByLabel('Kit name').fill('MY CHOPS');
  await ez.getByLabel('Kit name').press('Enter');
  await page.getByRole('switch', { name: 'EZ mode' }).click();
  await page.keyboard.down('Shift'); await page.keyboard.press('Digit6'); await page.keyboard.up('Shift');
  await expect(page.getByRole('region', { name: 'LCD' })).toContainText('MY CHOPS');
});

test('a phone-sized first visit starts on EZ', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true, isMobile: true, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'EZ panel' })).toBeVisible();
  await ctx.close();
});
