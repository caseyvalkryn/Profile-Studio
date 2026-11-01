import { expect, test } from '@playwright/test';
import { mapGeom, M_PER_NM, num, openTemplate, POINT_DEFENCE } from './helpers';

// Timing is measured in the page: performance.now() at the mousemove listener and at the first
// DOM change it causes. One retry absorbs a slow first frame on a busy machine.
test.describe.configure({ retries: 1 });

// Lane 10.3 removed the timeline. The preview's first-see ticks on the board (events layer,
// `line.fst`, drawn from preview.first) are the preview measure the drag must move in time.
test('12.4 Dragging a sensor ring changes range. The preview and the first-see ticks update within 100 ms.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const g = await mapGeom(page);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const ticks = page.locator('g[data-layer="events"] line.fst');
  const tickPos = () =>
    ticks.evaluateAll((ls) => ls.map((l) => `${l.getAttribute('x1')},${l.getAttribute('y1')}`));
  await expect(ticks.first()).toBeAttached();
  const ticksBefore = await tickPos();

  // RDR-1 sits at the origin with a 4000 m ring. Selecting it shows the range handle, due east
  // on an omni ring (src/board handles layer, legacy).
  await page.mouse.click(g.origin.x, g.origin.y);
  const r0 = 4000 * g.pxPerM;
  const start = { x: g.origin.x + r0, y: g.origin.y };
  await page.evaluate(() => {
    const w = window as unknown as { __lat: { move: number[]; tl: number[]; tip: number[] } };
    w.__lat = { move: [], tl: [], tip: [] };
    window.addEventListener('mousemove', () => w.__lat.move.push(performance.now()), true);
    const watch = (el: Element | null, out: number[]) =>
      el &&
      new MutationObserver(() => out.push(performance.now())).observe(el, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'x', 'x1', 'y1'],
      });
    watch(document.querySelector('g[data-layer="events"]'), w.__lat.tl);
    watch(document.querySelector('[data-testid="board-label"]'), w.__lat.tip);
  });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 6, start.y); // past the click threshold: the drag starts
  await page.waitForTimeout(400);
  const t0 = await page.evaluate(() => {
    const w = window as unknown as { __lat: { move: number[]; tl: number[]; tip: number[] } };
    w.__lat.move.length = 0;
    w.__lat.tl.length = 0;
    w.__lat.tip.length = 0;
    return performance.now();
  });
  const r1 = 6000 * g.pxPerM; // on the snap step, so the snapped range is the dragged one
  await page.mouse.move(g.origin.x + r1, start.y); // one move to the new range
  await page.waitForTimeout(400);
  const lat = await page.evaluate(
    () => (window as unknown as { __lat: { move: number[]; tl: number[]; tip: number[] } }).__lat,
  );
  await page.mouse.up();

  expect(lat.move.length).toBe(1);
  const moveAt = lat.move[0]!;
  expect(moveAt).toBeGreaterThan(t0);
  const ticksMs = (lat.tl.find((t) => t >= moveAt) ?? Infinity) - moveAt;
  const tip = (lat.tip.find((t) => t >= moveAt) ?? Infinity) - moveAt;
  test.info().annotations.push({
    type: 'latency',
    description: `first-see ticks ${ticksMs.toFixed(1)} ms, value readout ${tip.toFixed(1)} ms`,
  });
  console.log(
    `12.4 latency: first-see ticks ${ticksMs.toFixed(1)} ms, value readout ${tip.toFixed(1)} ms`,
  );
  expect(ticksMs).toBeLessThan(100);
  expect(tip).toBeLessThan(100);

  // The range changed and the first-see ticks moved out along the paths.
  const range = inspector.getByLabel('Range', { exact: true });
  expect(await num(range)).toBeCloseTo(6000 / M_PER_NM, 1);
  expect(await tickPos()).not.toEqual(ticksBefore);
});
