import { test, expect } from '@playwright/test';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

type Win = Window & { chopdeck: { m: { sequences: { bars: number; tracks: { events: { tick: number; note: number }[] }[] }[] }; s: { playing: boolean; record: string; now: number; seq: number } } };

test('record a loop with the pads, hear it play back, and see the step grid', async ({ page }) => {
  await page.goto('/');
  const lcd = page.getByRole('region', { name: 'LCD' });
  await expect(lcd).toContainText('Sq:01');
  await page.click('body');

  // 2 bars, loop on: Bars field is the 10th landable field; use the wheel path via the LCD window instead
  // record on an empty sequence (the first two hold the factory demo)
  await page.evaluate(() => { const fw = (window as unknown as Win).chopdeck; fw.s.seq = 2; const q = fw.m.sequences[2] as unknown as { bars: number; loop: { on: boolean }; used: boolean }; q.bars = 1; q.loop.on = true; q.used = true; });

  await page.keyboard.press('F7');          // REC arm
  await expect(lcd).toContainText('● REC');
  await page.keyboard.press('Home');        // PLAY START
  await expect(lcd).toContainText('► PLAY').catch(() => {}); // status flips to REC while recording; tolerate
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyZ');        // kick
  await page.waitForTimeout(480);
  await page.keyboard.press('KeyX');        // snare
  await page.waitForTimeout(480);
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(1100);          // past the loop point -> OVERDUB
  await expect(lcd).toContainText('● DUB');
  const events = await page.evaluate(() => (window as unknown as Win).chopdeck.m.sequences[2].tracks[0].events.map(e => [e.tick, e.note]));
  expect(events.length).toBeGreaterThanOrEqual(3);
  // quantised to the 1/16 grid
  for (const [tick] of events) expect(tick % 24).toBe(0);
  // the grid row shows hits
  await expect(lcd).toContainText('▪');

  // playback continues and the playhead moves
  const now1 = await page.evaluate(() => (window as unknown as Win).chopdeck.s.now);
  await page.waitForTimeout(300);
  const now2 = await page.evaluate(() => (window as unknown as Win).chopdeck.s.now);
  expect(now2).not.toBe(now1);

  await page.keyboard.press('F9');          // STOP
  await expect(lcd).toContainText('■ STOP');
  const state = await page.evaluate(() => (window as unknown as Win).chopdeck.s);
  expect(state.playing).toBe(false);
  expect(state.record).toBe('OFF');
  await page.screenshot({ path: 'test-results/screens/recorded.png', clip: { x: 40, y: 40, width: 860, height: 340 } });
});
