import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mapGeom } from './helpers';

const KMZ = resolve(__dirname, '../fixtures/kml/site.kmz');
const KML = resolve(__dirname, '../fixtures/kml/site.kml');

/**
 * The test rectangle in metres: laid out as 600 by 400 m with the equator constants, it is
 * 600.66 by 401.32 m on WGS84 at 35°N (src/domain/siteFile.test.ts).
 */
const RECT = { w: 600.66, h: 401.32 };

/** The plan-view size of one range area in metres: its client box over the scale bar's px per m. */
async function metresOf(page: Page, id: string) {
  const { pxPerM } = await mapGeom(page);
  const r = await page
    .locator(`[data-testid="board-stage"] svg.board polygon.vol-range[data-id="${id}"]`)
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { w: b.width, h: b.height };
    });
  return { w: r.w / pxPerM, h: r.h / pxPerM };
}

/** The plan-view bounding box of one range area, in SVG units. */
const bboxOf = (page: Page, id: string) =>
  page
    .locator(`[data-testid="board-stage"] svg.board polygon.vol-range[data-id="${id}"]`)
    .evaluate((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });

test('12.27 A KML or KMZ file draws its polygons as range areas at true scale; one undo removes an import.', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Import file').setInputFiles(KMZ);
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  const ranges = page.locator('[data-testid="board-stage"] svg.board polygon.vol-range');
  await expect(ranges).toHaveCount(2);
  await expect(page.getByTestId('inspector-many')).toHaveText('2 selected');
  await expect(page.locator('.dl-toast')).toHaveText(
    '2 areas from site.kmz. Site set from site.kmz.',
  );
  await expect(page.getByRole('textbox', { name: 'Profile name' })).toHaveValue('site');

  // The test rectangle draws at its true size in metres against the scale bar.
  const first = await bboxOf(page, 'RNG-1');
  const size = await metresOf(page, 'RNG-1');
  expect(Math.abs(size.w - RECT.w)).toBeLessThan(2);
  expect(Math.abs(size.h - RECT.h)).toBeLessThan(2);

  // one undo step
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(ranges).toHaveCount(0);

  // The same site as KML, dropped on the board, lands at the same place.
  const text = await readFile(KML, 'utf8');
  await page.getByTestId('board-stage').evaluate((stage, kml) => {
    const dt = new DataTransfer();
    dt.items.add(new File([kml], 'site.kml'));
    stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    stage.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  }, text);
  await expect(ranges).toHaveCount(2);
  await expect(page.locator('.dl-toast')).toContainText('2 areas from site.kml');
  const again = await bboxOf(page, 'RNG-1');
  for (const k of ['x', 'y', 'w', 'h'] as const)
    expect(Math.abs(again[k] - first[k])).toBeLessThan(1);

  // A dropped file that is not a site file says what the board takes and changes nothing.
  await page.getByTestId('board-stage').evaluate((stage) => {
    const dt = new DataTransfer();
    dt.items.add(new File(['notes'], 'notes.txt'));
    stage.dispatchEvent(
      new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('.dl-toast')).toHaveText('Drop a KML or KMZ file to import a site.');
  await expect(ranges).toHaveCount(2);

  // The palette's "Import a site file" opens a file chooser; the picked file adds two more.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('Import a site file');
  const chooser = page.waitForEvent('filechooser');
  await palette.getByRole('option', { name: /Import a site file/ }).click();
  await (await chooser).setFiles(KML);
  await expect(ranges).toHaveCount(4);
  await expect(page.locator('.dl-toast')).toHaveText('2 areas from site.kml.');
  const picked = await metresOf(page, 'RNG-3');
  expect(Math.abs(picked.w - RECT.w)).toBeLessThan(2);
  expect(Math.abs(picked.h - RECT.h)).toBeLessThan(2);
});
