/// <reference types="node" />
// Test kit for the board tests (node only; no app code imports it). Loads the legacy scripts in
// legacy/index.html order, as src/engine/preview.test.ts does, and builds DerivedView values from
// the frozen fixtures in fixtures/legacy-derive/.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { DerivedView, Envelope, TrackSpan } from './types';

export const FIXTURES = [
  'CUAS-001',
  'MULTI-001',
  'OWA-001',
  'SURR-001',
  'blank',
  'fixed-wing-ingress',
  'point-defence',
  'range-test',
  'swarm',
];

type Win = { tIn: number; tOut: number; rIn: number; rOut: number };
export type FixtureDerived = Omit<
  DerivedView,
  'holdsAt' | 'coveringAt' | 'originAt' | 'envelopesAt'
> & {
  tmax: number;
  trackLine: Record<string, TrackSpan[]>;
  windows: Record<string, Record<string, Win[]>>;
};
export type Fixture = { input: Record<string, unknown> & { id: string }; derived: FixtureDerived };

export function fixture(id: string): Fixture {
  const file = path.resolve(__dirname, '../../fixtures/legacy-derive', id + '.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Fixture;
}

/** DerivedView from fixture JSON: holdsAt and coveringAt read `windows`; originAt returns `origin`. */
export function derivedView(d: FixtureDerived): DerivedView {
  const W = d.windows || {};
  const inWin = (ws: Win[] | undefined, t: number) =>
    !!ws && ws.some((w) => t >= w.tIn && t <= w.tOut);
  return {
    ...d,
    originAt: () => d.origin || { x: 0, y: 0, z: 0 },
    holdsAt: (sys, t) => Object.keys(W[sys] || {}).filter((p) => inWin(W[sys]![p], t)),
    coveringAt: (pid, t) => Object.keys(W).filter((s) => inWin(W[s]![pid], t)),
  };
}

export type LegacyPS = {
  seed: { load(): (Record<string, unknown> & { id: string })[] };
  derive: { all(r: unknown): DerivedView & { tmax: number } };
  render: {
    scene(
      r: unknown,
      view: unknown,
      size: unknown,
      opts: unknown,
    ): { svg: string; hits: unknown[] };
    card(r: unknown, cd: unknown, size: unknown, thumb: boolean): string;
  };
  units: { set(m: string): void; mode: string };
  layers: { list(): { id: string }[] };
};

/** Source edits on one legacy script: [file, find, replace]; each find must occur once. */
export type LegacyPatch = readonly [file: string, find: string, replace: string];

let cached: LegacyPS | null = null;
/**
 * The live legacy app in a node vm. With patches, a fresh uncached copy whose scripts carry the
 * named deviations, so a parity test stays byte-strict on everything else.
 */
export function loadLegacy(patches: readonly LegacyPatch[] = []): LegacyPS {
  if (cached && !patches.length) return cached;
  const root = path.resolve(__dirname, '../../legacy');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]!);
  const ctx = vm.createContext({ console, performance: { now: () => Date.now() } });
  ctx.globalThis = ctx;
  const used = new Set<LegacyPatch>();
  for (const f of order) {
    let src = fs.readFileSync(path.join(root, f), 'utf8');
    for (const pt of patches) {
      if ('js/' + pt[0] !== f) continue;
      if (src.split(pt[1]).length !== 2) throw new Error('legacy patch not unique: ' + pt[1]);
      src = src.replace(pt[1], () => pt[2]);
      used.add(pt);
    }
    vm.runInContext(src, ctx, { filename: f });
  }
  for (const pt of patches) if (!used.has(pt)) throw new Error('legacy patch unused: ' + pt[0]);
  const ps = (ctx as unknown as { PS: LegacyPS }).PS;
  if (!patches.length) cached = ps;
  return ps;
}

/** Tag balance of an SVG string: every open tag closes in order. */
export function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    if (m[3] === '/') continue;
    if (m[1] === '/') {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]!);
  }
  return stack.length === 0;
}

export type { Envelope };
