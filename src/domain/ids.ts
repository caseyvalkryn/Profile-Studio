// Display ids per spec section 3 item 5. The lowest unused number is taken, as in legacy util.uid.

import type { AreaKind, EffectorKind, NodeKind, SensorKind } from './types';

export type IdKind =
  SensorKind | EffectorKind | NodeKind | AreaKind | 'threat' | 'question' | 'hypothesis' | 'card';

const PREFIX: Record<IdKind, string> = {
  radar: 'RDR-',
  rf: 'RF-',
  eoir: 'EO-',
  acoustic: 'AC-',
  ew: 'EW-',
  kinetic: 'KIN-',
  de: 'DE-',
  c2: 'C2-',
  tspi: 'TM-',
  threat: 'T',
  asset: 'DA',
  wez: 'WEZ-',
  nfz: 'NFZ-',
  ref: 'REF-',
  question: 'Q-',
  hypothesis: 'H-',
  card: 'c',
};

/** Kinds whose first id is the bare prefix (`DA`), then `DA-2`, `DA-3`. */
const BARE = new Set<IdKind>(['asset']);
/** Kinds whose number is zero-padded to two digits (`Q-01`). */
const PADDED = new Set<IdKind>(['question', 'hypothesis']);

/** Mint the next display id of a kind, skipping ids already in `existing`. */
export function nextId(kind: IdKind, existing: Iterable<string>): string {
  const used = new Set(existing);
  const prefix = PREFIX[kind];
  if (BARE.has(kind)) {
    if (!used.has(prefix)) return prefix;
    let n = 2;
    while (used.has(`${prefix}-${n}`)) n++;
    return `${prefix}-${n}`;
  }
  const fmt = (n: number) => prefix + (PADDED.has(kind) ? String(n).padStart(2, '0') : String(n));
  let n = 1;
  while (used.has(fmt(n))) n++;
  return fmt(n);
}

/** A UUID v4. Uses crypto.randomUUID where present, else crypto.getRandomValues, else Math.random. */
export function newKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
