// Layer labels (legacy 43-layer-labels.js, chip 6): one greedy placement pass over the label
// candidates the other layers queued. The selected object and the focus (a card's focus ids) go
// first, then by priority p, then by queue order (review 10.R F-02: a focused event names
// itself). A candidate whose padded box overlaps a placed box is dropped. With the chip
// off only "always" candidates (data blocks) place.
import { register } from '../layers';
import type { Box } from '../symbols';

const PAD = 2;

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x0 - PAD < b.x1 + PAD &&
    a.x1 + PAD > b.x0 - PAD &&
    a.y0 - PAD < b.y1 + PAD &&
    a.y1 + PAD > b.y0 - PAD
  );
}

register({
  id: 'labels',
  order: 90,
  chip: 6,
  defaultOn: true,
  cameras: ['plan', 'elev', 'axon'],
  inputs: [
    'profile',
    'scene',
    'derived',
    'cam',
    't',
    'sel',
    'hover',
    'focus',
    'layers',
    'units',
    'thumb',
    'hoverT',
    'ref',
    'origin',
  ],
  draw(ctx) {
    if (ctx.thumb) return '';
    const selId = ctx.sel && ctx.sel.id;
    const focus = ctx.focus || [];
    const first = (id: string | null | undefined) =>
      id != null && (id === selId || focus.indexOf(id) >= 0);
    const list = (ctx.labels || []).filter((c) => c && c.svg && (ctx.labelsOn || c.always));
    list.sort((a, b) => {
      const pa = first(a.id) ? 0 : a.p;
      const pb = first(b.id) ? 0 : b.p;
      return pa - pb || (a.n ?? 0) - (b.n ?? 0);
    });
    const placed: Box[] = [];
    let out = '';
    for (const c of list) {
      const bx = c.box;
      if (bx && placed.some((q) => overlaps(bx, q))) continue;
      if (bx) placed.push(bx);
      out += c.svg;
    }
    return out;
  },
});
