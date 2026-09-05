import { test, expect } from '@playwright/test';

/** Minimal 16-bit mono WAV: 0.2 s of a 440 Hz tone. */
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

test('pads make sound, files load through the LOAD flow, and the project survives a reload', async ({ page }) => {
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01');

  // hit pad 1 (kick) from the keyboard and measure the master bus
  await page.click('body');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(80);
  const level = await page.evaluate(async () => {
    const a = (window as unknown as { chopdeckAudio: { level(): number; ctx: AudioContext | null } }).chopdeckAudio;
    let peak = 0;
    for (let i = 0; i < 20; i++) { peak = Math.max(peak, a.level()); await new Promise(r => setTimeout(r, 10)); }
    return { peak, state: a.ctx?.state };
  });
  expect(level.state).toBe('running');
  expect(level.peak).toBeGreaterThan(0.02);

  // load a WAV via the hidden picker input
  const before = await page.evaluate(() => (window as unknown as { chopdeck: { m: { sounds: unknown[] } } }).chopdeck.m.sounds.length);
  await page.locator('input[type=file]').setInputFiles({ name: 'tone_a4.wav', mimeType: 'audio/wav', buffer: wav() });
  await expect(lcd).toContainText('File:TONE_A4.WAV');
  await page.keyboard.press('F6'); // DO IT
  await expect(lcd).toContainText('Load a Sound');
  await expect(lcd).toContainText('MONO  ');
  await expect(lcd).toContainText('0.20s');
  await page.keyboard.press('F5'); // KEEP
  const after = await page.evaluate(() => (window as unknown as { chopdeck: { m: { sounds: { name: string }[] } } }).chopdeck.m.sounds.map(s => s.name));
  expect(after.length).toBe(before + 1);
  expect(after).toContain('TONE_A4');

  // autosave + reload
  await page.waitForTimeout(2200);
  await page.reload();
  await expect(lcd).toContainText('Sq:01');
  const restored = await page.evaluate(() => (window as unknown as { chopdeck: { m: { sounds: { name: string }[] } } }).chopdeck.m.sounds.map(s => s.name));
  expect(restored).toContain('TONE_A4');
});
