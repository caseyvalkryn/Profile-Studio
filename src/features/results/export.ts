// Chart export: SVG with computed styles inlined, PNG drawn from that SVG at 2x. Pure apart from
// the DOM reads; the download helper is the only side effect.

/** Presentation properties copied from the computed style so the file looks as on screen. */
const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
] as const;

export type ExportMeta = {
  title: string;
  subtitle: string;
  note?: string;
  /** Colours resolved from the frame on screen. */
  background?: string;
  ink?: string;
  muted?: string;
  fontFamily?: string;
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineStyles(src: Element, dst: Element): void {
  const view = src.ownerDocument.defaultView;
  if (!view) return;
  const cs = view.getComputedStyle(src);
  const parts: string[] = [];
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v && v !== 'normal' && v !== 'auto') parts.push(`${p}:${v}`);
  }
  const own = dst.getAttribute('style');
  if (parts.length) dst.setAttribute('style', `${parts.join(';')}${own ? `;${own}` : ''}`);
}

export function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  if (w > 0 && h > 0) return { width: w, height: h };
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0) return { width: vb.width, height: vb.height };
  const r = svg.getBoundingClientRect();
  return { width: Math.round(r.width) || 640, height: Math.round(r.height) || 320 };
}

const HEADER = 52;
const FOOTER = 24;

/** The chart as a standalone SVG document: title, subtitle, the chart, the units note. */
export function serializeSvg(svg: SVGSVGElement, meta: ExportMeta): string {
  const { width, height } = svgSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  const srcAll = svg.querySelectorAll('*');
  const dstAll = clone.querySelectorAll('*');
  for (let i = 0; i < srcAll.length; i++) inlineStyles(srcAll[i]!, dstAll[i]!);
  clone.setAttribute('x', '0');
  clone.setAttribute('y', String(HEADER));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('class');
  const inner = new XMLSerializer().serializeToString(clone);
  const bg = meta.background ?? '#ffffff';
  const ink = meta.ink ?? '#1b1f24';
  const muted = meta.muted ?? '#5b6470';
  const font = escapeXml(meta.fontFamily ?? 'system-ui, sans-serif');
  const total = HEADER + height + (meta.note ? FOOTER : 0);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(bg)}"/>`,
    `<text x="0" y="18" fill="${escapeXml(ink)}" style="font-family:${font};font-size:15px;font-weight:600">${escapeXml(meta.title)}</text>`,
    `<text x="0" y="40" fill="${escapeXml(muted)}" style="font-family:${font};font-size:13px">${escapeXml(meta.subtitle)}</text>`,
    inner,
    meta.note
      ? `<text x="0" y="${total - 6}" fill="${escapeXml(muted)}" style="font-family:${font};font-size:11px">${escapeXml(meta.note)}</text>`
      : '',
    `</svg>`,
  ].join('');
}

/** The SVG text drawn on a canvas at `scale`, as a PNG blob. Browser only (jsdom has no canvas). */
export function svgToPng(svgText: string, scale = 2): Promise<Blob> {
  const m = /width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(svgText);
  const width = m ? Number(m[1]) : 640;
  const height = m ? Number(m[2]) : 320;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d canvas context'));
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
        'image/png',
      );
    };
    img.onerror = () => reject(new Error('the SVG did not load as an image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A file name from a chart title: lower case, dashes. */
export function fileNameFor(title: string, ext: 'svg' | 'png'): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'chart';
  return `${base}.${ext}`;
}
