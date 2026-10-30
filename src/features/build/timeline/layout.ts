// Timeline geometry in pixels. Shared by the component and its tests.

export const GUTTER_W = 64;
export const AXIS_H = 20;
export const ROW_H = 28;
export const LANE_H = 4;
export const ROW_PAD = 2;
export const PAD_R = 12;

/** The time span the axis shows. At least one minute so an empty vignette still draws. */
export function domainS(tmaxS: number): number {
  return tmaxS > 0 ? tmaxS : 60;
}

/** Pixel x of time `t` in a timeline `width` pixels wide. */
export function xOfTime(t: number, width: number, tmaxS: number): number {
  const span = Math.max(1, width - GUTTER_W - PAD_R);
  return GUTTER_W + (t / domainS(tmaxS)) * span;
}

/** Time at pixel x, clamped to the axis. */
export function timeOfX(x: number, width: number, tmaxS: number): number {
  const span = Math.max(1, width - GUTTER_W - PAD_R);
  const t = ((x - GUTTER_W) / span) * domainS(tmaxS);
  return Math.min(Math.max(0, t), domainS(tmaxS));
}

/** Top pixel of lane `i` (0 = Find) in row `row`. */
export function laneY(row: number, i: number): number {
  return AXIS_H + row * ROW_H + ROW_PAD + i * LANE_H;
}
