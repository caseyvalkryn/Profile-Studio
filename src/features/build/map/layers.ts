// Map style and layers. Colour means state (principle 5): neutral ink for the vignette, one
// hostile colour for threats, a quiet covered tint for a reach that holds a threat at time t,
// and the accent for selection, hover, handles and drafts only.
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type Colors = {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  panel: string;
  accent: string;
  hostile: string;
  covered: string;
};

/** Fallback state colours. `covered` comes from --state-covered; hostile has no token yet. */
const STATE = {
  light: { hostile: '#c2410c', covered: '#15803d' },
  dark: { hostile: '#fb923c', covered: '#4ade80' },
};

const FALLBACK: Colors = {
  bg: '#f6f7f8',
  ink: '#1b1f24',
  muted: '#5b6470',
  line: '#dde1e6',
  panel: '#ffffff',
  accent: '#2563eb',
  ...STATE.light,
};

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 128;
}

/** Read the token colours from the document. Falls back to the light tokens. */
export function readColors(el: Element = document.documentElement): Colors {
  const css = getComputedStyle(el);
  const v = (name: string, d: string) => css.getPropertyValue(name).trim() || d;
  const bg = v('--surface-0', FALLBACK.bg);
  return {
    bg,
    ink: v('--text', FALLBACK.ink),
    muted: v('--text-muted', FALLBACK.muted),
    line: v('--surface-3', FALLBACK.line),
    panel: v('--surface-1', FALLBACK.panel),
    accent: v('--accent', FALLBACK.accent),
    ...(isDark(bg) ? STATE.dark : STATE.light),
    covered: v('--state-covered', (isDark(bg) ? STATE.dark : STATE.light).covered),
  };
}

/** Sources, in draw order. Each is one GeoJSON source updated with setData. */
export const SOURCES = [
  'grid',
  'areas',
  'sensors',
  'effectors',
  'paths',
  'waypoints',
  'systems',
  'threats',
  'highlight',
  'handles',
  'draft',
] as const;
export type SourceName = (typeof SOURCES)[number];

/** Sources whose features carry `key` as their id, for feature state. */
export const PROMOTE_KEY: readonly SourceName[] = ['sensors', 'effectors'];

const covering = ['boolean', ['feature-state', 'covering'], false];
const isPoint = ['==', ['geometry-type'], 'Point'];
const notPoint = ['!=', ['geometry-type'], 'Point'];
const isSelected = ['==', ['get', 'role'], 'selected'];

export function layers(c: Colors): LayerSpecification[] {
  const L = [
    { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
    {
      id: 'grid-minor',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'major'], false],
      paint: { 'line-color': c.line, 'line-width': 1, 'line-opacity': 0.6 },
    },
    {
      id: 'grid-major',
      type: 'line',
      source: 'grid',
      filter: ['==', ['get', 'major'], true],
      paint: {
        'line-color': c.line,
        'line-width': ['case', ['boolean', ['get', 'origin'], false], 2, 1],
        'line-opacity': 1,
      },
    },
    {
      id: 'areas-fill',
      type: 'fill',
      source: 'areas',
      paint: {
        'fill-color': c.ink,
        'fill-opacity': ['match', ['get', 'kind'], 'asset', 0.1, 'nfz', 0.06, 0.03],
      },
    },
    {
      id: 'areas-line',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': ['match', ['get', 'kind'], 'asset', c.ink, c.muted],
        'line-width': ['match', ['get', 'kind'], 'asset', 1.5, 1],
      },
    },
    {
      id: 'sensors-fill',
      type: 'fill',
      source: 'sensors',
      paint: {
        'fill-color': ['case', covering, c.covered, c.ink],
        'fill-opacity': ['case', covering, 0.1, 0.03],
      },
    },
    {
      id: 'sensors-line',
      type: 'line',
      source: 'sensors',
      paint: { 'line-color': ['case', covering, c.covered, c.muted], 'line-width': 1 },
    },
    {
      id: 'effectors-fill',
      type: 'fill',
      source: 'effectors',
      paint: {
        'fill-color': ['case', covering, c.covered, c.ink],
        'fill-opacity': ['case', covering, 0.08, 0.02],
      },
    },
    {
      id: 'effectors-line',
      type: 'line',
      source: 'effectors',
      paint: {
        'line-color': ['case', covering, c.covered, c.muted],
        'line-width': 1,
        'line-dasharray': [4, 3],
      },
    },
    {
      id: 'paths-line',
      type: 'line',
      source: 'paths',
      paint: { 'line-color': c.hostile, 'line-width': 1.5, 'line-opacity': 0.6 },
    },
    {
      id: 'waypoints',
      type: 'circle',
      source: 'waypoints',
      paint: {
        'circle-radius': 3.5,
        'circle-color': c.panel,
        'circle-stroke-color': c.hostile,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'systems',
      type: 'circle',
      source: 'systems',
      paint: {
        'circle-radius': ['match', ['get', 'group'], 'node', 4, 5],
        'circle-color': ['match', ['get', 'group'], 'node', c.muted, c.ink],
        'circle-stroke-color': c.panel,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'threats',
      type: 'circle',
      source: 'threats',
      paint: {
        'circle-radius': 6,
        'circle-color': c.hostile,
        'circle-stroke-color': c.panel,
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'highlight-line',
      type: 'line',
      source: 'highlight',
      filter: notPoint,
      paint: {
        'line-color': c.accent,
        'line-width': ['case', isSelected, 2, 1.5],
        'line-opacity': ['case', isSelected, 1, 0.5],
      },
    },
    {
      id: 'highlight-point',
      type: 'circle',
      source: 'highlight',
      filter: isPoint,
      paint: {
        'circle-radius': 8,
        'circle-opacity': 0,
        'circle-stroke-color': c.accent,
        'circle-stroke-width': 2,
        'circle-stroke-opacity': ['case', isSelected, 1, 0.5],
      },
    },
    {
      id: 'handles-line',
      type: 'line',
      source: 'handles',
      filter: notPoint,
      paint: { 'line-color': c.accent, 'line-width': 1, 'line-dasharray': [2, 2] },
    },
    {
      id: 'handles-point',
      type: 'circle',
      source: 'handles',
      filter: isPoint,
      paint: {
        'circle-radius': 5,
        'circle-color': c.accent,
        'circle-stroke-color': c.panel,
        'circle-stroke-width': 1.5,
      },
    },
    {
      id: 'draft-line',
      type: 'line',
      source: 'draft',
      filter: notPoint,
      paint: { 'line-color': c.accent, 'line-width': 1.5, 'line-dasharray': [3, 2] },
    },
    {
      id: 'draft-point',
      type: 'circle',
      source: 'draft',
      filter: isPoint,
      paint: { 'circle-radius': 4, 'circle-color': c.accent },
    },
  ];
  return L as LayerSpecification[];
}

/** A blank style: no tiles, no glyphs, no network. The grid and the layers draw everything. */
export function blankStyle(c: Colors): StyleSpecification {
  return { version: 8, sources: {}, layers: [layers(c)[0]!] };
}
