// 2525-derived marks as SVG strings, legacy 41-symbols.js one to one. Class names only;
// board.css maps every class to a token. No literal colour here.
import { clamp, esc, r1, S, type Attrs } from './svg';

function pts(list: number[][]): string {
  return list.map((p) => r1(p[0]!) + ',' + r1(p[1]!)).join(' ');
}

const DIAMOND: Record<string, 1> = { hostile: 1, suspect: 1 };
const SQUARE: Record<string, 1> = { neutral: 1 };
const DASHED_ID: Record<string, 1> = { pending: 1, suspect: 1 };

/** Air track frame: closed line frame with board-tone knockout and the unmanned aircraft shallow V. */
export function airFrame(
  identity: string | null | undefined,
  status: string | null | undefined,
  sx: number,
  sy: number,
  r?: number,
): string {
  const id = identity || 'unknown';
  const st = status || 'normal';
  const rr = r || 7;
  let shape: string;
  if (DIAMOND[id]) {
    shape = S('polygon', {
      points: pts([
        [sx, sy - rr * 1.25],
        [sx + rr * 1.25, sy],
        [sx, sy + rr * 1.25],
        [sx - rr * 1.25, sy],
      ]),
      class: 'fk',
    });
  } else if (SQUARE[id]) {
    shape = S('rect', {
      x: r1(sx - rr),
      y: r1(sy - rr),
      width: r1(2 * rr),
      height: r1(2 * rr),
      class: 'fk',
    });
  } else {
    shape = S('circle', { cx: r1(sx), cy: r1(sy), r: r1(rr), class: 'fk' });
  }
  const v =
    rr * 2 >= 10
      ? S('polyline', {
          points: pts([
            [sx - rr * 0.55, sy - rr * 0.2],
            [sx, sy + rr * 0.3],
            [sx + rr * 0.55, sy - rr * 0.2],
          ]),
          class: 'fv',
        })
      : '';
  const dashed = DASHED_ID[id] || st === 'pending' || st === 'lost';
  return S('g', { class: 'af af-' + id + ' st-' + st + (dashed ? ' dash' : '') }, shape + v);
}

/** Target TSPI mark: a 9 px cross in the control ink. */
export function tspiCross(sx: number, sy: number): string {
  const h = 4.5;
  return S('path', {
    d:
      'M' +
      r1(sx - h) +
      ',' +
      r1(sy) +
      'H' +
      r1(sx + h) +
      'M' +
      r1(sx) +
      ',' +
      r1(sy - h) +
      'V' +
      r1(sy + h),
    class: 'tspi',
  });
}

/** Velocity leader. hx, hy: direction in screen px (y down). px clamped 10..48. */
export function leader(sx: number, sy: number, hx: number, hy: number, px: number): string {
  const L = Math.hypot(hx || 0, hy || 0);
  if (!(L > 1e-9)) return '';
  const n = clamp(px || 0, 10, 48);
  return S('line', {
    x1: r1(sx),
    y1: r1(sy),
    x2: r1(sx + (hx / L) * n),
    y2: r1(sy + (hy / L) * n),
    class: 'leader',
  });
}

/** Two mono lines right of the frame. */
export function dataBlock(sx: number, sy: number, line1: string, line2?: string): string {
  const x = r1(sx);
  return S(
    'text',
    { x, y: r1(sy - 2), class: 'db' },
    S('tspan', { x }, esc(line1 || '')) + (line2 ? S('tspan', { x, dy: 12 }, esc(line2)) : ''),
  );
}

const GLYPH: Record<string, (x: number, y: number) => string> = {
  radar: (x, y) =>
    S('path', {
      d:
        'M' +
        r1(x - 4) +
        ',' +
        r1(y + 1) +
        'Q' +
        r1(x) +
        ',' +
        r1(y - 5) +
        ' ' +
        r1(x + 4) +
        ',' +
        r1(y + 1) +
        'M' +
        r1(x) +
        ',' +
        r1(y - 1) +
        'V' +
        r1(y - 6),
      class: 'gg',
    }),
  rf: (x, y) =>
    S('path', {
      d:
        'M' +
        r1(x) +
        ',' +
        r1(y + 4) +
        'V' +
        r1(y - 3) +
        'M' +
        r1(x - 3.5) +
        ',' +
        r1(y - 4) +
        'L' +
        r1(x) +
        ',' +
        r1(y - 1) +
        'L' +
        r1(x + 3.5) +
        ',' +
        r1(y - 4),
      class: 'gg',
    }),
  eoir: (x, y) =>
    S('ellipse', { cx: r1(x), cy: r1(y), rx: 4, ry: 2.2, class: 'gg' }) +
    S('circle', { cx: r1(x), cy: r1(y), r: 1, class: 'ggf' }),
  acoustic: (x, y) =>
    S('path', {
      d:
        'M' +
        r1(x - 2) +
        ',' +
        r1(y - 3) +
        'Q' +
        r1(x + 1) +
        ',' +
        r1(y) +
        ' ' +
        r1(x - 2) +
        ',' +
        r1(y + 3) +
        'M' +
        r1(x + 1) +
        ',' +
        r1(y - 4.5) +
        'Q' +
        r1(x + 4.5) +
        ',' +
        r1(y) +
        ' ' +
        r1(x + 1) +
        ',' +
        r1(y + 4.5),
      class: 'gg',
    }),
  kinetic: (x, y) =>
    S('path', {
      d:
        'M' +
        r1(x) +
        ',' +
        r1(y - 4.5) +
        'L' +
        r1(x + 2.5) +
        ',' +
        r1(y - 1) +
        'H' +
        r1(x + 1) +
        'V' +
        r1(y + 4) +
        'H' +
        r1(x - 1) +
        'V' +
        r1(y - 1) +
        'H' +
        r1(x - 2.5) +
        'Z',
      class: 'gg',
    }),
  de: (x, y) =>
    S('path', {
      d:
        'M' +
        r1(x - 4) +
        ',' +
        r1(y + 3) +
        'L' +
        r1(x + 4) +
        ',' +
        r1(y - 3) +
        'M' +
        r1(x + 1.5) +
        ',' +
        r1(y - 3.5) +
        'L' +
        r1(x + 4) +
        ',' +
        r1(y - 3) +
        'L' +
        r1(x + 3.5) +
        ',' +
        r1(y - 0.5),
      class: 'gg',
    }),
  ew: (x, y) => S('text', { x: r1(x), y: r1(y + 2.6), class: 'gt' }, 'EW'),
};

/** Ground system frame. kind: a system kind, "c2", "tspi" or "asset". status: active|inactive|degraded. */
export function groundFrame(
  kind: string,
  status: string | null | undefined,
  sx: number,
  sy: number,
): string {
  const st = status || 'active';
  let body: string;
  if (kind === 'tspi') {
    body =
      S('rect', { x: r1(sx - 4.5), y: r1(sy - 4.5), width: 9, height: 9, class: 'gfk gf-tspi' }) +
      S('circle', { cx: r1(sx), cy: r1(sy), r: 1.3, class: 'ggf gf-tspi' });
  } else if (kind === 'c2') {
    body =
      S('rect', { x: r1(sx - 9), y: r1(sy - 6), width: 18, height: 12, class: 'gfk' }) +
      S('text', { x: r1(sx), y: r1(sy + 2.6), class: 'gt' }, 'C2');
  } else if (kind === 'asset') {
    body =
      S('rect', { x: r1(sx - 10), y: r1(sy - 7), width: 20, height: 14, class: 'gfk' }) +
      S('line', { x1: r1(sx - 10), y1: r1(sy - 4), x2: r1(sx + 10), y2: r1(sy - 4), class: 'gg' }) +
      S('text', { x: r1(sx), y: r1(sy + 4), class: 'gt' }, 'DA');
  } else {
    const g = GLYPH[kind];
    body = S('circle', { cx: r1(sx), cy: r1(sy), r: 7, class: 'gfk' }) + (g ? g(sx, sy) : '');
  }
  const bar =
    st === 'degraded'
      ? S('rect', { x: r1(sx - 7), y: r1(sy + 9), width: 14, height: 2.5, class: 'degr' })
      : '';
  return S('g', { class: 'gf gf-' + kind + ' gs-' + st }, body + bar);
}

/** a and b are [sx, sy] */
export function lockLine(a: number[], b: number[], style?: string): string {
  return S('line', {
    x1: r1(a[0]!),
    y1: r1(a[1]!),
    x2: r1(b[0]!),
    y2: r1(b[1]!),
    class: 'll ll-' + (style || 'tracking'),
  });
}

/** Engagement bar above the frame. */
export function engageBar(sx: number, sy: number, text: string): string {
  const w = Math.max(30, String(text).length * 6.4 + 6);
  return S(
    'g',
    { class: 'eng' },
    S('rect', { x: r1(sx - w / 2), y: r1(sy - 25), width: r1(w), height: 11, class: 'engb' }) +
      S('text', { x: r1(sx), y: r1(sy - 16.5), class: 'engt' }, esc(text)),
  );
}

export function missionKill(sx: number, sy: number, r?: number): string {
  const rr = (r || 7) * 1.5;
  return S('line', {
    x1: r1(sx - rr),
    y1: r1(sy + rr),
    x2: r1(sx + rr),
    y2: r1(sy - rr),
    class: 'mk',
  });
}

export type HandleExtra = { filled?: boolean; angle?: number; r?: number; attrs?: Attrs };

/** Handle marks with a transparent hit circle under them. */
export function handle(kind: string, sx: number, sy: number, extra?: HandleExtra): string {
  const ex = extra || {};
  const x = r1(sx);
  const y = r1(sy);
  const on = ex.filled ? ' on' : '';
  let mark: string;
  switch (kind) {
    case 'wp':
      mark = S('circle', { cx: x, cy: y, r: 5, class: 'hm' + on });
      break;
    case 'vertex':
      mark = S('rect', { x: r1(sx - 4), y: r1(sy - 4), width: 8, height: 8, class: 'hm' + on });
      break;
    case 'bead':
      mark = S('circle', { cx: x, cy: y, r: 8, class: 'hm hm-bead' + on });
      break;
    case 'range':
      mark = S('rect', {
        x: r1(sx - 3),
        y: r1(sy - 3),
        width: 6,
        height: 6,
        class: 'hm hm-sq' + on,
      });
      break;
    case 'arcEnd':
    case 'elRay': {
      const a = ((ex.angle || 0) * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const tri = [
        [6, 0],
        [-3, 4.5],
        [-3, -4.5],
      ].map((p) => [sx + p[0]! * c - p[1]! * s, sy + p[0]! * s + p[1]! * c]);
      mark = S('polygon', { points: pts(tri), class: 'hm hm-tri' + on });
      break;
    }
    case 'arcMid':
      mark = S('circle', { cx: x, cy: y, r: 3.5, class: 'hm hm-mid' + on });
      break;
    case 'insert':
    case 'edge':
      mark = S('path', {
        d:
          'M' +
          r1(sx - 3.5) +
          ',' +
          y +
          'H' +
          r1(sx + 3.5) +
          'M' +
          x +
          ',' +
          r1(sy - 3.5) +
          'V' +
          r1(sy + 3.5),
        class: 'hm hm-plus',
      });
      break;
    case 'hold':
      mark =
        S('circle', { cx: x, cy: y, r: r1(ex.r || 9), class: 'hm hm-hold' }) +
        S('circle', { cx: r1(sx + (ex.r || 9)), cy: y, r: 3, class: 'hm' + on });
      break;
    case 'top':
      mark = S('rect', {
        x: r1(sx - 8),
        y: r1(sy - 2),
        width: 16,
        height: 4,
        class: 'hm hm-sq' + on,
      });
      break;
    case 'line':
      mark = S('polygon', {
        points: pts([
          [sx, sy - 5],
          [sx + 5, sy],
          [sx, sy + 5],
          [sx - 5, sy],
        ]),
        class: 'hm' + on,
      });
      break;
    default:
      mark = S('circle', { cx: x, cy: y, r: 4, class: 'hm' + on });
  }
  const hx = kind === 'hold' ? r1(sx + (ex.r || 9)) : x;
  const attrs: Attrs = Object.assign({ class: 'h h-' + kind }, ex.attrs || {});
  return S('g', attrs, S('circle', { cx: hx, cy: y, r: 7, class: 'hit' }) + mark);
}

/** North arrow with 30 degree ticks; northDeg rotates it clockwise. */
export function compass(sx: number, sy: number, r: number, northDeg: number): string {
  let t = '';
  for (let a = 0; a < 360; a += 30) {
    const q = (a * Math.PI) / 180;
    const i = a % 90 === 0 ? r - 4 : r - 2.5;
    t +=
      'M' +
      r1(sx + Math.sin(q) * i) +
      ',' +
      r1(sy - Math.cos(q) * i) +
      'L' +
      r1(sx + Math.sin(q) * r) +
      ',' +
      r1(sy - Math.cos(q) * r);
  }
  const arrow = S('polygon', {
    points: pts([
      [sx, sy - r + 1],
      [sx + 3.5, sy + 2],
      [sx, sy],
      [sx - 3.5, sy + 2],
    ]),
    class: 'cpa',
  });
  return S(
    'g',
    {
      class: 'compass',
      transform: 'rotate(' + r1(northDeg || 0) + ' ' + r1(sx) + ' ' + r1(sy) + ')',
    },
    S('circle', { cx: r1(sx), cy: r1(sy), r: r1(r), class: 'cpr' }) +
      S('path', { d: t, class: 'cpt' }) +
      arrow +
      S('text', { x: r1(sx), y: r1(sy - r - 3), class: 'cpn' }, 'N'),
  );
}

export function scaleBar(sx: number, sy: number, px: number, label: string, twin?: string): string {
  const x0 = r1(sx);
  const x1 = r1(sx + px);
  return S(
    'g',
    { class: 'scale' },
    S('path', {
      d: 'M' + x0 + ',' + r1(sy - 4) + 'V' + r1(sy) + 'H' + x1 + 'V' + r1(sy - 4),
      class: 'scl',
    }) +
      S('text', { x: x0, y: r1(sy - 7), class: 'sct' }, esc(label)) +
      (twin ? S('text', { x: x0, y: r1(sy + 12), class: 'sct sct2' }, esc(twin)) : ''),
  );
}

export function warn(sx: number, sy: number): string {
  return S(
    'g',
    { class: 'warnmk' },
    S('polygon', {
      points: pts([
        [sx, sy - 6],
        [sx + 6, sy + 4.5],
        [sx - 6, sy + 4.5],
      ]),
      class: 'wt',
    }) + S('text', { x: r1(sx), y: r1(sy + 3.5), class: 'wx' }, '!'),
  );
}

/** A key point stage: the six F2T2EA steps and the defended asset entry. */
export type KeyPointStage = 'find' | 'fix' | 'track' | 'target' | 'engage' | 'assess' | 'da';

/**
 * The key point glyph of one stage, centred on (sx, sy): the geometry of the strip's glyphs
 * (src/features/timeline/glyphs.tsx, r = 4). Not in legacy (lane 13.3). `kpo` shapes are open
 * (filled with the board), `kpf` shapes are filled with the mark's ink, `kpg` alone is a stroke.
 */
export function keyPoint(stage: KeyPointStage, sx: number, sy: number): string {
  // direct strings, as S() would write them: a full board draws up to 7 marks per threat
  const x = r1(sx);
  const y = r1(sy);
  const xy = (dx: number, dy: number) => r1(sx + dx) + ',' + r1(sy + dy);
  const ring = '<circle cx="' + x + '" cy="' + y + '" r="4" class="kpg kpo"></circle>';
  switch (stage) {
    case 'find':
      return ring;
    case 'fix':
      return ring + '<circle cx="' + x + '" cy="' + y + '" r="1.5" class="kpg kpf"></circle>';
    case 'track':
      return (
        '<polygon points="' +
        xy(0, -4.5) +
        ' ' +
        xy(4.5, 0) +
        ' ' +
        xy(0, 4.5) +
        ' ' +
        xy(-4.5, 0) +
        '" class="kpg kpo"></polygon>'
      );
    case 'target':
      // one path: the ring (board fill) and the cross (zero area, stroke only)
      return (
        '<path d="M' +
        xy(-4, 0) +
        'A4,4 0 1 0 ' +
        xy(4, 0) +
        'A4,4 0 1 0 ' +
        xy(-4, 0) +
        'M' +
        xy(-4, 0) +
        'H' +
        r1(sx + 4) +
        'M' +
        xy(0, -4) +
        'V' +
        r1(sy + 4) +
        '" class="kpg kpo"></path>'
      );
    case 'engage':
      return (
        '<polygon points="' +
        xy(0, -4.5) +
        ' ' +
        xy(4.5, 4) +
        ' ' +
        xy(-4.5, 4) +
        '" class="kpg kpf"></polygon>'
      );
    case 'assess':
      // one path: the square (board fill) and the tick inside it
      return (
        '<path d="M' +
        xy(-4, -4) +
        'h8v8h-8ZM' +
        xy(-2.5, 0) +
        'L' +
        xy(-0.5, 2) +
        'L' +
        xy(2.5, -2) +
        '" class="kpg kpo"></path>'
      );
    case 'da':
      return (
        '<rect x="' +
        r1(sx - 1.5) +
        '" y="' +
        r1(sy - 4.5) +
        '" width="3" height="9" class="kpg kpda"></rect>'
      );
  }
}

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Approximate text box for the label pass. size: font px; mono width 0.6 em per character. */
export function textBox(
  x: number,
  y: number,
  lines: string | string[],
  size?: number,
  anchor?: string,
): Box {
  const ls = Array.isArray(lines) ? lines : [String(lines)];
  const sz = size || 11.5;
  let w = 0;
  for (const l of ls) w = Math.max(w, String(l).length * sz * 0.6);
  const h = ls.length * sz * 1.05;
  const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x0, y0: y - sz * 0.85, x1: x0 + w, y1: y - sz * 0.85 + h };
}

export function label(x: number, y: number, text: string, cls?: string, anchor?: string): string {
  return S(
    'text',
    {
      x: r1(x),
      y: r1(y),
      class: 'lbl' + (cls ? ' ' + cls : ''),
      'text-anchor': anchor && anchor !== 'start' ? anchor : null,
    },
    esc(text),
  );
}

export const symbols = {
  airFrame,
  tspiCross,
  leader,
  dataBlock,
  groundFrame,
  lockLine,
  engageBar,
  missionKill,
  handle,
  compass,
  scaleBar,
  warn,
  keyPoint,
  textBox,
  label,
};
export type Symbols = typeof symbols;
