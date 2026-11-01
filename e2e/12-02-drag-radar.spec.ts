import { expect, test } from '@playwright/test';
import { assetCentres, mapGeom, M_PER_NM, num, openTemplate, POINT_DEFENCE } from './helpers';

test('12.2 Dragging a radar from the library places it at the drop point. One undo removes it.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const before = await assetCentres(page);

  // Empty map south-west of the origin (3 km W, 2 km S), on the snap grid.
  const dropM = { x: -3000, y: -2000 };
  const drop = { x: g.origin.x + dropM.x * g.pxPerM, y: g.origin.y - dropM.y * g.pxPerM };
  // The library rows are the quick-add palette's (A opens it); a row drags onto the board.
  // Playwright's mouse drag does not start an HTML drag from inside the palette dialog, so the
  // drag events carry one DataTransfer from the row to the board stage.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('a');
  const source = page.getByRole('option', { name: /^3D radar/ });
  const stage = page.getByTestId('board-stage');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const ev = { dataTransfer, clientX: drop.x, clientY: drop.y };
  await source.dispatchEvent('dragstart', { dataTransfer });
  await stage.dispatchEvent('dragover', ev);
  await stage.dispatchEvent('drop', ev);

  // The new radar's frame is centred on the drop point. The board fits the grown scene, so the
  // point is read in the new geometry.
  await expect.poll(async () => (await assetCentres(page)).size).toBe(before.size + 1);
  const after = await assetCentres(page);
  const [newId, at] = [...after].find(([id]) => !before.has(id))!;
  expect(newId).toMatch(/^RDR-\d+$/);
  const g2 = await mapGeom(page);
  expect(Math.abs(g2.box.x + at.x - (g2.origin.x + dropM.x * g2.pxPerM))).toBeLessThanOrEqual(3);
  expect(Math.abs(g2.box.y + at.y - (g2.origin.y - dropM.y * g2.pxPerM))).toBeLessThanOrEqual(3);

  // The inspector reads the same point in nm.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const eastNm = dropM.x / M_PER_NM;
  const northNm = dropM.y / M_PER_NM;
  expect(await num(inspector.getByLabel('East (x)'))).toBeCloseTo(eastNm, 1);
  expect(await num(inspector.getByLabel('North (y)'))).toBeCloseTo(northNm, 1);

  await page.locator('body').click({ position: { x: 5, y: 5 } }); // no text field has focus
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => [...(await assetCentres(page)).keys()].sort())
    .toEqual([...before.keys()].sort());
});
