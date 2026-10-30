// Shared steps for the acceptance suite. Each test runs in a fresh browser context, so the app
// starts at an empty Library with nothing in IndexedDB.
import { expect, type Locator, type Page } from '@playwright/test';

export const POINT_DEFENCE = 'Point defence, single quadrotor';
export const M_PER_NM = 1852;

/** Open the Library and open a template, which lands on Build. */
export async function openTemplate(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: `Open template ${name}` }).click();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(page.locator('[data-label="grid"]').first()).toBeAttached();
}

/** Switch workspace through the app bar. */
export async function goTo(page: Page, name: 'Library' | 'Build' | 'Results' | 'Report') {
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('link', { name }).click();
}

/** Press Run on Build and wait for the run to finish. */
export async function runOnce(page: Page, runId: string): Promise<void> {
  await page.getByRole('main', { name: 'Build' }).getByRole('button', { name: 'Run' }).click();
  await expect(page.getByText(`Run ${runId} done`)).toBeVisible({ timeout: 30_000 });
}

/** The map overlay labels are absolutely placed divs: `translate(Xpx, Ypx)` inside the map. */
async function labelBoxes(page: Page, cls: string) {
  return page.locator(`[data-label="${cls}"]`).evaluateAll((els) =>
    els.map((el) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
      return { text: el.textContent ?? '', x: Number(m?.[1]), y: Number(m?.[2]) };
    }),
  );
}

/** Asset labels by display id, in map pixels relative to the map container. */
export async function assetLabels(page: Page): Promise<Map<string, { x: number; y: number }>> {
  const boxes = await labelBoxes(page, 'asset');
  return new Map(boxes.map((b) => [b.text, { x: b.x, y: b.y }]));
}

export type MapGeom = {
  /** The map container's top-left in client pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** The vignette origin in client pixels. */
  origin: { x: number; y: number };
  /** Screen pixels per metre. */
  pxPerM: number;
};

/**
 * Map geometry from the grid labels. The x-axis label for a value sits 3 px right of its line;
 * the y-axis label sits 14 px above its line (controller.ts, renderLabels).
 */
export async function mapGeom(page: Page): Promise<MapGeom> {
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  const grid = await labelBoxes(page, 'grid');
  const xAxis = grid.filter((g) => g.y > box.height / 2 && /^[\d.]+ nm( [EW])?$/.test(g.text));
  const yAxis = grid.filter((g) => g.x < 10 && /^[\d.]+ nm( [NS])?$/.test(g.text));
  const x0 = xAxis.find((g) => g.text === '0 nm');
  const x1 = xAxis.find((g) => g.text === '1 nm E');
  const y0 = yAxis.find((g) => g.text === '0 nm');
  if (!x0 || !x1 || !y0) throw new Error(`grid labels not found: ${JSON.stringify(grid)}`);
  return {
    box,
    origin: { x: box.x + x0.x - 3, y: box.y + y0.y + 14 },
    pxPerM: (x1.x - x0.x) / M_PER_NM,
  };
}

/** A displayed number, such as "1.62" or "2,297", as a number. */
export const num = async (field: Locator) => Number((await field.inputValue()).replace(/,/g, ''));

/** True when the app reads Mod as Cmd (src/commands/registry.ts, isMac). */
export const isMac = (page: Page) =>
  page.evaluate(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
  });

/** Select H-01 in the inspector and state its prediction, in nm. */
export async function setPrediction(page: Page, low: string, high: string): Promise<void> {
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: /^H-01/ }).click();
  for (const [label, value] of [
    ['Prediction low', low],
    ['Prediction high', high],
  ] as const) {
    const field = inspector.getByRole('textbox', { name: label });
    await field.fill(value);
    await field.press('Enter');
    await field.blur(); // unfocused fields show readout precision
    await expect.poll(() => num(field)).toBeCloseTo(Number(value), 2);
  }
}
