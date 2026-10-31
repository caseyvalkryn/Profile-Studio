// Legacy PS.util.S and esc (00-ns.js) and the camera rounding r1 (40-cameras.js), one to one.

export type Attrs = Record<string, string | number | boolean | null | undefined>;

export function esc(s: unknown): string {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** attrs with a null, undefined or false value are left out; values are escaped */
export function S(tag: string, attrs?: Attrs | null, inner?: string | null): string {
  let a = '';
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      a += ' ' + k + '="' + esc(v) + '"';
    }
  }
  return '<' + tag + a + '>' + (inner == null ? '' : inner) + '</' + tag + '>';
}

export function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
