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
  await expect(
    page.locator('[data-testid="board-stage"] svg.board line.axis').first(),
  ).toBeAttached();
}

/** Switch workspace through the app bar. */
export async function goTo(page: Page, name: 'Library' | 'Build' | 'Brief') {
  await page.getByRole('navigation', { name: 'Workspaces' }).getByRole('link', { name }).click();
}

/** What the helpers read off the board SVG, in client pixels. */
type BoardRead = {
  box: { x: number; y: number; width: number; height: number };
  origin: { x: number; y: number };
  pxPerM: number;
  /** System centres by display id, relative to the stage's top-left. */
  systems: [string, { x: number; y: number }][];
};

/**
 * Read the board (src/board, plan view): the world axes (`line.axis`) cross at the origin, the
 * scale bar (`g.scale`) gives pixels per metre, and each system's frame (`.gf .gfk`) is centred
 * on the system. SVG units go to client pixels through the SVG's screen matrix.
 */
async function readBoard(page: Page): Promise<BoardRead> {
  return page.getByTestId('board-stage').evaluate((stage) => {
    const svg = stage.querySelector('svg.board') as SVGSVGElement;
    const m = svg.getScreenCTM()!;
    const r = stage.getBoundingClientRect();
    const toClient = (x: number, y: number) => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return { x: p.x, y: p.y };
    };
    const n = (el: Element, a: string) => Number(el.getAttribute(a));
    let ox = NaN;
    let oy = NaN;
    for (const l of Array.from(svg.querySelectorAll('line.axis'))) {
      if (n(l, 'x1') === n(l, 'x2')) ox = n(l, 'x1');
      if (n(l, 'y1') === n(l, 'y2')) oy = n(l, 'y1');
    }
    const d = svg.querySelector('g.scale path.scl')?.getAttribute('d') ?? '';
    const bar = /^M(-?[\d.]+),-?[\d.]+V-?[\d.]+H(-?[\d.]+)/.exec(d);
    const text = svg.querySelector('g.scale text.sct:not(.sct2)')?.textContent ?? '';
    const lab = /^([\d.]+) (nm|km)$/.exec(text);
    if (!bar || !lab || isNaN(ox) || isNaN(oy))
      throw new Error(`board axes or scale bar not found: ${d} ${text} ${ox} ${oy}`);
    const metres = Number(lab[1]) * (lab[2] === 'nm' ? 1852 : 1000);
    const systems: [string, { x: number; y: number }][] = [];
    for (const g of Array.from(svg.querySelectorAll('g[data-k="system"][data-role="centre"]'))) {
      const f = g.querySelector('.gf .gfk') as SVGGraphicsElement | null;
      if (!f) continue;
      const b = f.getBBox();
      const c = toClient(b.x + b.width / 2, b.y + b.height / 2);
      systems.push([g.getAttribute('data-id') ?? '', { x: c.x - r.x, y: c.y - r.y }]);
    }
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      origin: toClient(ox, oy),
      pxPerM: ((Number(bar[2]) - Number(bar[1])) * m.a) / metres,
      systems,
    };
  });
}

/** System centres by display id, in pixels relative to the board stage. */
export async function assetCentres(page: Page): Promise<Map<string, { x: number; y: number }>> {
  return new Map((await readBoard(page)).systems);
}

export type MapGeom = {
  /** The board stage's top-left in client pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** The vignette origin in client pixels. */
  origin: { x: number; y: number };
  /** Screen pixels per metre. */
  pxPerM: number;
};

/** Board geometry in plan: the origin from the world axes, the scale from the scale bar. */
export async function mapGeom(page: Page): Promise<MapGeom> {
  const { box, origin, pxPerM } = await readBoard(page);
  return { box, origin, pxPerM };
}

/** A displayed number, such as "1.62" or "2,297", as a number. */
export const num = async (field: Locator) => Number((await field.inputValue()).replace(/,/g, ''));

/** True when the app reads Mod as Cmd (src/commands/registry.ts, isMac). */
export const isMac = (page: Page) =>
  page.evaluate(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
  });
