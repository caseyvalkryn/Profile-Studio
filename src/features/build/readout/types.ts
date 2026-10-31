// The readout's data contract: the legacy derived.at bundle (legacy/js/21-derive.js), field for
// field, so lane 9.2.6 binds `derived.at(threatId, tS, ref)` from src/engine/at.ts without an
// adapter. Keys are display ids (T1, RDR-1); `ref` is 'asset' or a system id. Stored units:
// metres, seconds, metres per second, degrees.

/** One track at one time, seen from the reference (legacy derived.at). */
export interface ReadoutSource {
  /** East of the site origin. */
  x: number;
  /** North of the site origin. */
  y: number;
  /** Height above ground. */
  z: number;
  /** Horizontal range from the reference. */
  r: number;
  /** Bearing from the reference, clockwise from north. */
  brg: number;
  /** Track heading; null while it holds. */
  hdg: number | null;
  /** Ground speed. */
  spd: number;
  /** Closing speed toward the reference; motion away is negative. */
  vc: number;
  /** Seconds to the defended asset: 0 inside it, null when the path never enters it. */
  tta: number | null;
  /** Engagement window: first effector reach minus first sensor reach, in seconds. */
  window: number | null;
  /** Latest engage that still gets an effect in time, minus the engage time, in seconds. */
  margin: number | null;
  /** Display ids of the systems that hold the track at this time. */
  covering: string[];
}

/** `at(threatId, tS, ref)`: the track with display id `threatId` at `tS`, or null. */
export type ReadoutAt = (threatId: string, tS: number, ref: string) => ReadoutSource | null;
