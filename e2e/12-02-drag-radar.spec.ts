import { expect, test } from '@playwright/test';
import { assetLabels, mapGeom, M_PER_NM, num, openTemplate, POINT_DEFENCE } from './helpers';

test('12.2 Dragging a radar from the library places it at the drop point. One undo removes it.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const before = await assetLabels(page);

  // Empty map south-west of the origin.
  const drop = { x: g.origin.x - 220, y: g.origin.y + 160 };
  const source = page.getByRole('button', { name: /^3D radar/ });
  await source.dragTo(page.getByTestId('map-canvas'), {
    targetPosition: { x: drop.x - g.box.x, y: drop.y - g.box.y },
  });

  // The new radar's label sits 8 px right and 4 px below its centre.
  await expect.poll(async () => (await assetLabels(page)).size).toBe(before.size + 1);
  const after = await assetLabels(page);
  const [newId, at] = [...after].find(([id]) => !before.has(id))!;
  expect(newId).toMatch(/^RDR-\d+$/);
  expect(Math.abs(g.box.x + at.x - 8 - drop.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(g.box.y + at.y - 4 - drop.y)).toBeLessThanOrEqual(3);

  // The inspector reads the same point in nm.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const eastNm = (drop.x - g.origin.x) / g.pxPerM / M_PER_NM;
  const northNm = (g.origin.y - drop.y) / g.pxPerM / M_PER_NM;
  expect(await num(inspector.getByLabel('East (x)'))).toBeCloseTo(eastNm, 1);
  expect(await num(inspector.getByLabel('North (y)'))).toBeCloseTo(northNm, 1);

  await page.locator('body').click({ position: { x: 5, y: 5 } }); // no text field has focus
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => [...(await assetLabels(page)).keys()].sort())
    .toEqual([...before.keys()].sort());
});
