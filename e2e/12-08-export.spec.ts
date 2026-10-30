import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE, runOnce } from './helpers';

const SECTIONS = [
  '1. Question',
  '2. Hypothesis and prediction',
  '3. Setup',
  '4. Results',
  '5. Evaluation',
  '6. Scope of inference',
  '7. Next test',
];

async function download(page: Page, item: 'Export PNG' | 'Export SVG', button: number) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: 'Export chart' }).nth(button).click();
      await page.getByRole('menuitem', { name: item }).click();
    })(),
  ]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

test('12.8 The AAR exports as PDF with all seven sections, and each chart exports as PNG and SVG.', async ({
  page,
}) => {
  // Headless Chromium has no print dialog: record the call, then print the page to PDF.
  await page.addInitScript(() => {
    const w = window as unknown as { __printed: number };
    w.__printed = 0;
    window.print = () => void (w.__printed += 1);
  });
  await openTemplate(page, POINT_DEFENCE);
  await runOnce(page, 'R-1');
  await goTo(page, 'Report');

  // Pick every chart the report offers.
  const picks = page.getByRole('checkbox', { name: /^\d+\.\d+\.\d+/ });
  await expect(picks.first()).toBeVisible();
  for (const box of await picks.all()) await box.check();
  const charts = page.getByRole('button', { name: 'Export chart' });
  await expect(charts).toHaveCount(await picks.count());

  // PDF: the Export PDF button calls print; under the print stylesheet all seven sections show.
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  const h2 = page.getByRole('heading', { level: 2 });
  await expect(h2).toHaveText(SECTIONS);
  for (const title of SECTIONS)
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeHidden(); // no screen controls
  const pdf = await page.pdf({ format: 'Letter', printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(10_000);
  await page.emulateMedia({ media: 'screen' });

  // Each chart: PNG and SVG through the download event.
  const n = await charts.count();
  for (let i = 0; i < n; i++) {
    const png = await download(page, 'Export PNG', i);
    expect(png.name).toMatch(/\.png$/);
    expect([...png.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svg = await download(page, 'Export SVG', i);
    expect(svg.name).toMatch(/\.svg$/);
    const text = svg.bytes.toString('utf8');
    expect(text).toMatch(/<svg[\s>]/);
    expect(text).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  }
});
