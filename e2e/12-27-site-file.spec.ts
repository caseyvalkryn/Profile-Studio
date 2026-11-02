import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const KMZ = resolve(__dirname, '../fixtures/kml/site.kmz');
const KML = resolve(__dirname, '../fixtures/kml/site.kml');

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
  await expect(page.locator('.dl-toast')).toContainText('2 areas from site.kmz');
  await expect(page.getByRole('textbox', { name: 'Profile name' })).toHaveValue('site');

  // The test rectangle is 600 by 400 m: the drawn box keeps the 1.5 ratio.
  const first = await bboxOf(page, 'RNG-1');
  expect(Math.abs(first.w / first.h - 1.5)).toBeLessThan(0.03);

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
});
