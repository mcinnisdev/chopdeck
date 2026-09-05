import { test, expect } from '@playwright/test';

// Visual pass over the modes: one screenshot each into test-results/screens/.
type Step = { key: string; shift?: boolean };
const modes: { name: string; steps: Step[]; expectText: string }[] = [
  { name: 'mixer', steps: [{ key: 'Digit7', shift: true }], expectText: 'Stereo mix' },
  { name: 'program', steps: [{ key: 'Digit6', shift: true }, { key: 'F1' }], expectText: 'Pgm:' },
  { name: 'load', steps: [{ key: 'Digit3', shift: true }], expectText: 'Device:' },
  { name: 'save', steps: [{ key: 'Digit0', shift: true }], expectText: 'Type:Save' },
  { name: 'trim', steps: [{ key: 'Digit5', shift: true }], expectText: 'Snd:' },
  { name: 'trim-zone', steps: [{ key: 'Digit5', shift: true }, { key: 'F3' }], expectText: 'Zone:' },
  { name: 'sample', steps: [{ key: 'Digit4', shift: true }], expectText: 'Threshold:' },
  { name: 'step', steps: [{ key: 'F1' }], expectText: 'View:' },
  { name: 'song', steps: [{ key: 'Digit1', shift: true }], expectText: 'Song:' },
  { name: 'edit', steps: [{ key: 'F2' }], expectText: 'Edit:' },
  { name: 'misc', steps: [{ key: 'Digit2', shift: true }], expectText: 'Auto punch' },
  { name: 'track-mute', steps: [], expectText: 'Press pads' },
];

for (const m of modes) {
  test(`screen: ${m.name}`, async ({ page }) => {
    await page.goto('/');
    const lcd = page.getByRole('region', { name: 'LCD' });
    await expect(lcd).toContainText('Sq:01');
    if (m.name === 'track-mute') await page.getByRole('button', { name: 'TRACK MUTE' }).click();
    for (const s of m.steps) {
      if (s.shift) await page.keyboard.down('Shift');
      await page.keyboard.press(s.key);
      if (s.shift) await page.keyboard.up('Shift');
    }
    await expect(lcd).toContainText(m.expectText);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/screens/${m.name}.png`, clip: { x: 40, y: 40, width: 860, height: 420 } });
  });
}
