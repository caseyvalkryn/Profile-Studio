import { expect, test } from '@playwright/test';
import { assetLabels, mapGeom, openTemplate, POINT_DEFENCE } from './helpers';

test('12.3 Right-click on empty map, Add here, Sensor, Radar places a radar at the click point.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const before = await assetLabels(page);

  const at = { x: g.origin.x - 220, y: g.origin.y + 160 };
  await page.mouse.click(at.x, at.y, { button: 'right' });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: /^Add here/ }).click();
  await page.getByRole('menuitem', { name: /^Sensors/ }).click();
  await page.getByRole('menuitem', { name: /^3D radar/ }).click();

  await expect.poll(async () => (await assetLabels(page)).size).toBe(before.size + 1);
  const after = await assetLabels(page);
  const [newId, label] = [...after].find(([id]) => !before.has(id))!;
  expect(newId).toMatch(/^RDR-\d+$/);
  expect(Math.abs(g.box.x + label.x - 8 - at.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(g.box.y + label.y - 4 - at.y)).toBeLessThanOrEqual(3);
});
