import { test, expect } from '@playwright/test';

// Visual pass over the modes: one screenshot each into test-results/screens/.
const modes: [string, string, string][] = [
  ['7', 'MIXER', 'Stereo mix'],
  ['6', 'PROGRAM', 'Pgm:'],
  ['3', 'LOAD', 'Drop audio'],
  ['5', 'TRIM', 'Snd:'],
  ['4', 'SAMPLE', 'Threshold:'],
];

for (const [digit, name, expectText] of modes) {
  test(`SHIFT+${digit} shows ${name}`, async ({ page }) => {
    await page.goto('/');
    const lcd = page.getByRole('region', { name: 'LCD' });
    await expect(lcd).toContainText('Sq:01');
    await page.keyboard.down('Shift');
    await page.keyboard.press(`Digit${digit}`);
    await page.keyboard.up('Shift');
    if (name === 'PROGRAM') await page.keyboard.press('F1'); // DRUM 1
    await expect(lcd).toContainText(expectText);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/screens/${name.toLowerCase()}.png`, clip: { x: 40, y: 40, width: 860, height: 340 } });
  });
}
