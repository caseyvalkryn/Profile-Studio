// A small MapLibre fake for jsdom, which has no WebGL. A linear projection: `k` pixels per degree
// around `center`, north up. Tests use it through vi.mock('maplibre-gl', () => import(...)).
type LngLatLike = [number, number] | { lng: number; lat: number };
type Handler = (...args: unknown[]) => void;

const ll = (v: LngLatLike) => (Array.isArray(v) ? { lng: v[0], lat: v[1] } : v);

export class FakeSource {
  data: unknown = null;
  calls = 0;
  constructor(readonly options: Record<string, unknown>) {
    this.data = options.data;
  }
  setData(d: unknown) {
    this.data = d;
    this.calls++;
    return Promise.resolve();
  }
}

export const instances: Map[] = [];

export let workerUrl = '';
export function setWorkerUrl(u: string) {
  workerUrl = u;
}

export class Map {
  center: { lng: number; lat: number };
  /** Pixels per degree of latitude. */
  k = 10000;
  w = 800;
  h = 600;
  sources = new globalThis.Map<string, FakeSource>();
  layers: { id: string }[] = [];
  handlers = new globalThis.Map<string, Handler[]>();
  featureState = new globalThis.Map<string, Record<string, unknown>>();
  paint: [string, string, unknown][] = [];
  removed = false;
  canvas: HTMLCanvasElement;
  doubleClickZoom = { enable: () => {}, disable: () => {} };
  touchZoomRotate = { disableRotation: () => {} };

  constructor(readonly options: { container: HTMLElement; center?: LngLatLike; zoom?: number }) {
    this.center = ll(options.center ?? [0, 0]);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    options.container.appendChild(this.canvas);
    instances.push(this);
  }
  on(ev: string, fn: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }
  fire(ev: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(ev) ?? []) fn(...args);
  }
  addSource(id: string, opts: Record<string, unknown>) {
    this.sources.set(id, new FakeSource(opts));
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addLayer(l: { id: string }) {
    this.layers.push(l);
  }
  setPaintProperty(id: string, k: string, v: unknown) {
    this.paint.push([id, k, v]);
  }
  setFeatureState(f: { source: string; id: string }, s: Record<string, unknown>) {
    this.featureState.set(`${f.source}:${f.id}`, s);
  }
  getCanvas() {
    return this.canvas;
  }
  project(v: LngLatLike) {
    const p = ll(v);
    return {
      x: (p.lng - this.center.lng) * this.k + this.w / 2,
      y: (this.center.lat - p.lat) * this.k + this.h / 2,
    };
  }
  unproject(v: [number, number]) {
    return {
      lng: this.center.lng + (v[0] - this.w / 2) / this.k,
      lat: this.center.lat - (v[1] - this.h / 2) / this.k,
    };
  }
  fitBounds(b: [LngLatLike, LngLatLike]) {
    const a = ll(b[0]);
    const c = ll(b[1]);
    this.center = { lng: (a.lng + c.lng) / 2, lat: (a.lat + c.lat) / 2 };
    return this;
  }
  remove() {
    this.removed = true;
  }
}
