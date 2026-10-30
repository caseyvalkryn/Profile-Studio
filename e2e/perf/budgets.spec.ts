// Budget measurements for docs/spec.md section 11 (lane 7.3, reviews/phase-7-budgets.md).
// Excluded from `npm run e2e`. Run: npx playwright test -c e2e/perf/playwright.perf.config.mts
// Every budget is measured REPS times; each test logs one `PERF` line per sample and a summary.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { SENSOR_KINDS } from '../../src/domain/catalog';
import { newKey } from '../../src/domain/ids';
import { swarmSplit } from '../../src/domain/templates/swarmSplit';
import {
  effector,
  hypothesis,
  question,
  sensor,
  setting,
  threat,
  vignette,
} from '../../src/domain/templates/build';
import type { Vignette } from '../../src/domain/types';
import { run } from '../../src/engine/run';
import { M_PER_NM, num, openTemplate, POINT_DEFENCE } from '../helpers';

const REPS = 5;
const DIST = join(process.cwd(), 'dist');

type Stat = { median: number; worst: number; all: number[] };
function stat(xs: number[], worstIsMax = true): Stat {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)]!, worst: worstIsMax ? s.at(-1)! : s[0]!, all: xs };
}
const fmt = (x: number) => x.toFixed(1);
function report(name: string, s: Stat, unit: string) {
  console.log(
    `PERF ${name}: median ${fmt(s.median)} ${unit}, worst ${fmt(s.worst)} ${unit} [${s.all.map(fmt).join(', ')}]`,
  );
}

/**
 * 40 threats with 3-waypoint paths in the north-east quadrant and 15 sensors: RDR-1 at the origin
 * with a 2500 m ring whose west side is clear, the other 14 in a block to the south-east.
 */
function bigVignette(): Vignette {
  const threats = Array.from({ length: 40 }, (_, i) => {
    const a = ((5 + i * 2) * Math.PI) / 180;
    const at = (r: number, da: number) => ({
      key: newKey(),
      x: Math.round(r * Math.cos(a + da)),
      y: Math.round(r * Math.sin(a + da)),
      z: 100,
      holdS: 0,
    });
    return threat(`T${i + 1}`, 'g1-quad-isr', [at(7000, 0), at(3500, 0.05), at(300, 0)], 20);
  });
  const sensors = [sensor('RDR-1', 'radar', 0, 0, 2500)];
  for (let i = 1; i < 15; i++) {
    const kind = SENSOR_KINDS[i % SENSOR_KINDS.length]!;
    const prefix = { radar: 'RDR', rf: 'RF', eoir: 'EO', acoustic: 'AC' }[kind] ?? 'S';
    sensors.push(
      sensor(
        `${prefix}-${i + 1}`,
        kind,
        1000 + (i % 7) * 400,
        -1200 - Math.floor(i / 7) * 600,
        1200,
      ),
    );
  }
  const Q = question('Perf vignette: 40 threats, 15 sensors.');
  const m = setting('1.1.2', '>=', 3000, 'm');
  return vignette({
    name: 'Perf 40 x 15',
    questions: [Q],
    hypotheses: [hypothesis(Q, m, { low: 2000, high: 3000 })],
    threats,
    sensors,
    effectors: [effector('EW-1', 'ew', 0, 0, 1500)],
    measures: [m],
  });
}

/** Write a vignette into the app's IndexedDB (src/state/persist.ts: `profile-studio`/`vignettes`). */
async function seed(page: Page, v: Vignette) {
  await page.evaluate(
    (v) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('profile-studio', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('vignettes'))
            req.result.createObjectStore('vignettes', { keyPath: 'id' });
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('vignettes', 'readwrite');
          tx.objectStore('vignettes').put(v);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    v,
  );
}

/** Map geometry from any two x-axis grid labels and the 0 nm labels (controller.ts renderLabels). */
async function geom(page: Page) {
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  const grid = await page.locator('[data-label="grid"]').evaluateAll((els) =>
    els.map((el) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((el as HTMLElement).style.transform);
      return { text: el.textContent ?? '', x: Number(m?.[1]), y: Number(m?.[2]) };
    }),
  );
  const val = (t: string) => {
    const m = /^([\d.]+) nm(?: ([EWNS]))?$/.exec(t);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'W' || m[2] === 'S' ? -1 : 1);
  };
  const xs = grid.filter((g) => g.y > box.height / 2 && /( [EW])?$/.test(g.text) && g.x > 10);
  const x0 = xs.find((g) => g.text === '0 nm');
  const x1 = xs.find((g) => /E$/.test(g.text));
  const y0 = grid.find((g) => g.x < 10 && g.text === '0 nm');
  if (!x0 || !x1 || !y0) throw new Error(`grid labels not found: ${JSON.stringify(grid)}`);
  const pxPerM = (x1.x - x0.x) / (val(x1.text)! * M_PER_NM);
  const origin = { x: box.x + x0.x - 3, y: box.y + y0.y + 14 };
  return {
    box,
    origin,
    pxPerM,
    at: (x: number, y: number) => ({ x: origin.x + x * pxPerM, y: origin.y - y * pxPerM }),
  };
}

/** rAF tick timestamps in the page, from start() to stop(). */
const FRAMES = {
  start: (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __fr: { on: boolean; ts: number[] } };
      w.__fr = { on: true, ts: [] };
      const loop = (t: number) => {
        if (!w.__fr.on) return;
        w.__fr.ts.push(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }),
  stop: (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __fr: { on: boolean; ts: number[] } };
      w.__fr.on = false;
      const ts = w.__fr.ts;
      let gap = 0;
      for (let i = 1; i < ts.length; i++) gap = Math.max(gap, ts[i]! - ts[i - 1]!);
      const fps = ((ts.length - 1) * 1000) / (ts.at(-1)! - ts[0]!);
      return { fps, gap, frames: ts.length };
    }),
};

/** Hold the button at `from` and move along `path(phase)` at about 60 Hz for `ms`. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  path: (phase: number) => { x: number; y: number },
  ms = 2000,
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y);
  await page.mouse.move(from.x, from.y);
  await FRAMES.start(page);
  const t0 = Date.now();
  let moves = 0;
  for (let t = 0; t < ms; t = Date.now() - t0) {
    const p = path(t / ms);
    await page.mouse.move(p.x, p.y);
    moves++;
    const next = t0 + moves * 16;
    const wait = next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  const r = await FRAMES.stop(page);
  const tip = await page.locator('[data-testid="map-view"] [role="status"]').allTextContents();
  await page.mouse.up();
  return { ...r, moves, tip: tip.join(' | ') };
}

async function machine(page: Page, browser: Browser) {
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl');
    const ext = c?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(c!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  console.log(`PERF machine: chromium ${browser.version()}, WebGL ${gl}, node ${process.version}`);
}

test('node: engine run, 200 replicates x 6 threats (swarm template)', () => {
  const v = swarmSplit.make();
  expect(v.threats).toHaveLength(6);
  run(v, 20, 1); // warm-up
  const ts: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const t0 = performance.now();
    run(v, 200, i + 1);
    ts.push(performance.now() - t0);
  }
  report('engine run 200x6 (node)', stat(ts), 'ms');
});

test('map drag and preview latency, 40 threats x 15 sensors', async ({ page, browser }) => {
  const v = bigVignette();
  await page.goto('/');
  await machine(page, browser);
  await seed(page, v);
  await page.goto('/build');
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(page.locator('[data-label="grid"]').first()).toBeAttached();
  await expect(page.locator('[data-label="asset"]'))
    .toHaveCount(16 + 0, { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1000);
  const g = await geom(page);
  console.log(`PERF geometry: pxPerM ${g.pxPerM.toFixed(4)}, box ${JSON.stringify(g.box)}`);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  // Idle baseline: the frame rate the page reaches with no input.
  await FRAMES.start(page);
  await page.waitForTimeout(2000);
  const idle = await FRAMES.stop(page);
  console.log(`PERF idle: ${fmt(idle.fps)} fps, worst gap ${fmt(idle.gap)} ms`);

  // Ring drag: RDR-1's west edge, swept between 2500 m and 1900 m.
  const ringFps: number[] = [];
  const ringGap: number[] = [];
  let r = 2500;
  for (let i = 0; i < REPS; i++) {
    const from = g.at(-r, 0);
    const res = await drag(page, from, (ph) => g.at(-(r - 600 * Math.sin(Math.PI * ph)), 0));
    console.log(
      `PERF ring drag ${i + 1}: ${fmt(res.fps)} fps, gap ${fmt(res.gap)} ms, ${res.moves} moves, tip "${res.tip}"`,
    );
    ringFps.push(res.fps);
    ringGap.push(res.gap);
    r = (await num(inspector.getByLabel('Range', { exact: true }))) * M_PER_NM;
  }
  report('ring drag fps', stat(ringFps, false), 'fps');
  report('ring drag worst gap', stat(ringGap), 'ms');

  // Waypoint drag: T1's first waypoint (bearing 5 degrees, 7000 m), swept east and back.
  const wpFps: number[] = [];
  const wpGap: number[] = [];
  const w = v.threats[0]!.path[0]!;
  for (let i = 0; i < REPS; i++) {
    const from = g.at(w.x, w.y);
    const res = await drag(page, from, (ph) => ({
      x: from.x + 60 * Math.sin(Math.PI * ph),
      y: from.y + 20 * Math.sin(2 * Math.PI * ph),
    }));
    console.log(
      `PERF waypoint drag ${i + 1}: ${fmt(res.fps)} fps, gap ${fmt(res.gap)} ms, ${res.moves} moves, tip "${res.tip}"`,
    );
    wpFps.push(res.fps);
    wpGap.push(res.gap);
  }
  report('waypoint drag fps', stat(wpFps, false), 'fps');
  report('waypoint drag worst gap', stat(wpGap), 'ms');

  // Preview latency, the 12.4 method: one mousemove inside a ring drag, then the first change of
  // the timeline svg and of the map value readout.
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
        attributeFilter: ['aria-label', 'x'],
      });
    watch(
      document.querySelector('[data-testid="timeline-row"]')?.closest('svg') ?? null,
      w.__lat.tl,
    );
    watch(document.querySelector('[data-testid="map-view"] [role="status"]'), w.__lat.tip);
  });
  const tlMs: number[] = [];
  const tipMs: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const start = g.at(-r, 0);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 6, start.y);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const w = window as unknown as { __lat: { move: number[]; tl: number[]; tip: number[] } };
      w.__lat.move.length = 0;
      w.__lat.tl.length = 0;
      w.__lat.tip.length = 0;
    });
    const r1 = i % 2 === 0 ? r - 500 : r + 500;
    const to = g.at(-r1, 0);
    await page.mouse.move(to.x, to.y);
    await page.waitForTimeout(400);
    const lat = await page.evaluate(
      () => (window as unknown as { __lat: { move: number[]; tl: number[]; tip: number[] } }).__lat,
    );
    await page.mouse.up();
    expect(lat.move.length).toBe(1);
    const m = lat.move[0]!;
    const tl = (lat.tl.find((t) => t >= m) ?? Infinity) - m;
    const tip = (lat.tip.find((t) => t >= m) ?? Infinity) - m;
    console.log(`PERF preview latency ${i + 1}: timeline ${fmt(tl)} ms, readout ${fmt(tip)} ms`);
    tlMs.push(tl);
    tipMs.push(tip);
    r = (await num(inspector.getByLabel('Range', { exact: true }))) * M_PER_NM;
  }
  report('preview latency timeline', stat(tlMs), 'ms');
  report('preview latency readout', stat(tipMs), 'ms');
});

test('run 200 replicates, 6 threats, through the Run button', async ({ page }) => {
  // The UI has no replicate field: Run sends DEFAULT_RUN_N (100). Rewrite n to 200 where the
  // request enters the worker, so the Run button, worker, progress and store path is the app's.
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, m: unknown, ...rest: unknown[]) {
      const req = m as { type?: string; n?: number };
      const next = req && req.type === 'run' ? { ...req, n: 200 } : m;
      return (post as (...a: unknown[]) => void).call(this, next, ...rest);
    } as Worker['postMessage'];
  });
  const totals: number[] = [];
  const gaps: number[] = [];
  for (let i = 0; i < REPS; i++) {
    await page.evaluate(() => indexedDB.deleteDatabase('profile-studio')).catch(() => undefined);
    await openTemplate(page, 'Swarm of six, split');
    await page.evaluate(() => {
      const w = window as unknown as {
        __run: { click: number; done: number; progress: string[]; nameFocus: number };
      };
      w.__run = { click: 0, done: 0, progress: [], nameFocus: 0 };
      const btn = Array.from(document.querySelectorAll('main[aria-label="Build"] button')).find(
        (b) => b.textContent?.trim() === 'Run',
      )!;
      btn.addEventListener('click', () => (w.__run.click = performance.now()), true);
      document
        .querySelector('input[aria-label="Vignette name"]')!
        .addEventListener('focus', () => (w.__run.nameFocus = performance.now()));
      new MutationObserver(() => {
        const p = document.querySelector('[aria-label="Run progress"]')?.textContent;
        if (p && w.__run.progress.at(-1) !== p) w.__run.progress.push(p);
        if (!w.__run.done && /Run R-\d+ done/.test(document.body.textContent ?? ''))
          w.__run.done = performance.now();
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await FRAMES.start(page);
    await page.getByRole('main', { name: 'Build' }).getByRole('button', { name: 'Run' }).click();
    await page.getByRole('textbox', { name: 'Vignette name' }).click();
    await expect(page.getByText(/Run R-\d+ done/)).toBeVisible({ timeout: 60_000 });
    const fr = await FRAMES.stop(page);
    const res = await page.evaluate(
      () =>
        (
          window as unknown as {
            __run: { click: number; done: number; progress: string[]; nameFocus: number };
          }
        ).__run,
    );
    const total = res.done - res.click;
    const focusIn = res.nameFocus > 0 && res.nameFocus < res.done;
    console.log(
      `PERF run ${i + 1}: ${fmt(total)} ms, ${res.progress.length} progress texts ` +
        `(${res.progress.slice(0, 3).join(', ')} ... ${res.progress.at(-1) ?? ''}), ` +
        `click during run focused the name field: ${focusIn} (+${fmt(res.nameFocus - res.click)} ms), ` +
        `rAF worst gap ${fmt(fr.gap)} ms`,
    );
    expect(res.progress.at(-1)).toMatch(/200\/200/);
    totals.push(total);
    gaps.push(fr.gap);
    await page.getByRole('textbox', { name: 'Vignette name' }).press('Escape');
  }
  report('run 200x6 (browser)', stat(totals), 'ms');
  report('run 200x6 main-thread worst gap', stat(gaps), 'ms');
});

/** Navigation timings for one cold load. `then` is the first interaction after load. */
async function load(browser: Browser, path: '/' | '/build', throttle: number, v: Vignette | null) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://localhost:5177',
  });
  if (v) {
    const p0 = await ctx.newPage();
    await p0.goto('/');
    await seed(p0, v);
    await p0.close();
  }
  const page = await ctx.newPage();
  if (throttle > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __ld: Record<string, number> };
    w.__ld = {};
    const mark = (k: string) => {
      if (!w.__ld[k]) w.__ld[k] = performance.now();
    };
    addEventListener('click', () => mark('click'), true);
    new MutationObserver(() => {
      if (document.querySelector('button[aria-label^="Open template"]')) mark('card');
      if (document.querySelector('[data-label="grid"]')) mark('map');
      if (document.querySelector('main[aria-label="Build"]')) mark('build');
      if (w.__ld.click && document.querySelector('section[aria-label="Templates"]'))
        mark('library');
    }).observe(document, { subtree: true, childList: true });
  });
  await page.goto(path, { waitUntil: 'commit' });
  if (path === '/') {
    await page.getByRole('button', { name: `Open template ${POINT_DEFENCE}` }).click();
    await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  } else {
    await expect(page.locator('[data-label="grid"]').first()).toBeAttached({ timeout: 30_000 });
    await page
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link', { name: 'Library' })
      .click();
    await expect(page.getByRole('region', { name: 'Templates' })).toBeVisible();
  }
  const t = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN;
    return {
      fcp,
      dcl: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      ...(window as unknown as { __ld: Record<string, number> }).__ld,
    };
  });
  const preClick = await page.evaluate(() => {
    const click = (window as unknown as { __ld: Record<string, number> }).__ld.click ?? Infinity;
    return performance
      .getEntriesByType('resource')
      .filter((e) => e.startTime < click && /\.(js|css)$/.test(e.name))
      .map((e) => e.name.replace(/^.*\//, ''));
  });
  await ctx.close();
  return { ...t, preClick };
}

test('first load, / and /build, unthrottled and 4x CPU throttle', async ({ browser }) => {
  const v = bigVignette();
  for (const throttle of [1, 4]) {
    for (const path of ['/', '/build'] as const) {
      const rows: Record<string, number>[] = [];
      for (let i = 0; i < REPS; i++) {
        const r = await load(browser, path, throttle, path === '/build' ? v : null);
        const { preClick, ...nums } = r;
        rows.push(nums as unknown as Record<string, number>);
        console.log(
          `PERF load ${path} x${throttle} ${i + 1}: ${Object.entries(nums)
            .map(([k, n]) => `${k} ${fmt(n as number)}`)
            .join(', ')}${i === 0 ? ` | js/css: ${preClick.join(' ')}` : ''}`,
        );
      }
      for (const k of ['fcp', 'dcl', 'card', 'map', 'click', 'build', 'library'])
        if (rows.every((r) => typeof r[k] === 'number'))
          report(`load ${path} x${throttle} ${k}`, stat(rows.map((r) => r[k]!)), 'ms');
    }
  }
});

test('bundle: gzip size of every built chunk', () => {
  const dir = join(DIST, 'assets');
  for (const f of readdirSync(dir)
    .filter((f) => /\.(js|css)$/.test(f))
    .sort()) {
    const buf = readFileSync(join(dir, f));
    console.log(
      `PERF chunk ${f}: ${(buf.length / 1024).toFixed(1)} kB raw, ${(gzipSync(buf).length / 1024).toFixed(1)} kB gzip`,
    );
  }
});
