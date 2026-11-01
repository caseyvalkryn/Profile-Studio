import { expect, test } from '@playwright/test';
import { assetCentres, mapGeom, openTemplate, POINT_DEFENCE } from './helpers';

test('12.3 Right-click on empty map, Add 3D radar here places a radar at the click point.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const before = await assetCentres(page);

  // An empty spot in metres (2 km W, 2 km S), clear of every ring and sector at any panel size.
  const atM = { x: -2000, y: -2000 };
  const at = { x: g.origin.x + atM.x * g.pxPerM, y: g.origin.y - atM.y * g.pxPerM };
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = page.getByRole('menu');
  // The map menu runs taller than the viewport; Enter picks the item wherever it sits.
  await menu.getByRole('menuitem', { name: /^Add 3D radar here/i }).press('Enter');

  await expect.poll(async () => (await assetCentres(page)).size).toBe(before.size + 1);
  const after = await assetCentres(page);
  const [newId, label] = [...after].find(([id]) => !before.has(id))!;
  expect(newId).toMatch(/^RDR-\d+$/);
  // The board fits the grown scene, so the point is read in the new geometry.
  const g2 = await mapGeom(page);
  expect(Math.abs(g2.box.x + label.x - (g2.origin.x + atM.x * g2.pxPerM))).toBeLessThanOrEqual(3);
  expect(Math.abs(g2.box.y + label.y - (g2.origin.y - atM.y * g2.pxPerM))).toBeLessThanOrEqual(3);
});
