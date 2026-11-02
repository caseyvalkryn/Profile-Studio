import { expect, test } from '@playwright/test';
import { assetCentres, mapGeom, openTemplate, POINT_DEFENCE } from './helpers';

test('12.26 A drag on the empty board selects everything in the rectangle. A drag on one selected object moves them all. One undo puts them back.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const before = await assetCentres(page);
  expect(before.size).toBeGreaterThanOrEqual(2);
  const svg = page.locator('[data-testid="board-stage"] svg.board');
  const marquee = page.getByTestId('board-marquee');

  // The asset sits north-west of the origin and the threat comes from the north-east, so the
  // south-west corner of the board is empty. A rectangle from there to the north-east corner
  // covers every object.
  const a = { x: g.box.x + 12, y: g.box.y + g.box.height - 12 };
  const b = { x: g.box.x + g.box.width - 12, y: g.box.y + 12 };
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await expect(marquee).toBeVisible();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect(marquee).toBeHidden();
  await expect(svg.locator('g[data-layer="systems"] [data-k="system"].sel')).toHaveCount(
    before.size,
  );
  await expect(page.getByTestId('inspector-many')).toHaveText(/^\d+ selected$/);
  await expect(page.getByTestId('board-msg')).toHaveText(/ selected\.$/);

  // RDR-1 sits at the origin. A drag on it moves every selected object by one snapped offset.
  const d = { x: 60, y: 40 };
  await page.mouse.move(g.origin.x, g.origin.y);
  await page.mouse.down();
  await page.mouse.move(g.origin.x + d.x / 2, g.origin.y + d.y / 2, { steps: 4 });
  await page.mouse.move(g.origin.x + d.x, g.origin.y + d.y, { steps: 4 });
  await page.mouse.up();
  const after = await assetCentres(page);
  const ref = after.get('RDR-1')!;
  const moved = { x: ref.x - before.get('RDR-1')!.x, y: ref.y - before.get('RDR-1')!.y };
  expect(Math.hypot(moved.x, moved.y)).toBeGreaterThan(10);
  for (const [id, p0] of before) {
    const p1 = after.get(id)!;
    expect(Math.abs(p1.x - p0.x - moved.x), id).toBeLessThanOrEqual(2);
    expect(Math.abs(p1.y - p0.y - moved.y), id).toBeLessThanOrEqual(2);
  }

  // one undo step
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => {
      const now = await assetCentres(page);
      return [...before].every(([id, p0]) => {
        const p1 = now.get(id);
        return !!p1 && Math.abs(p1.x - p0.x) <= 2 && Math.abs(p1.y - p0.y) <= 2;
      });
    })
    .toBe(true);
});
