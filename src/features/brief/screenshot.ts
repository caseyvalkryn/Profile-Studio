// Save a screenshot (lane 12.3, user request of 2026-11-01): the stage as a PNG at twice its
// measured size. The stage's SVG is the `render.card` output, styled by board.css classes and
// CSS variables that an image cannot read, so the capture copies each element's computed paint
// and type onto a clone first. The clone goes through an <img> as a data URL onto a canvas,
// then `toBlob` and an <a download>. Text draws in whatever font the canvas resolves (the
// bundled Geist faces do not load inside an SVG image).
import { fmtTime } from '../shared/units';

/** The capture scale: 2x the stage's measured size. */
export const SCALE = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** "V-test-c2-t+3-20.png"; "V-test-build-full-run.png" for the Build view with time off. */
export function screenshotName(profileId: string, cardId: string | null, t: number | null): string {
  const safe = (s: string) => s.replace(/[^\w.+-]+/g, '_');
  const when = t == null ? 'full-run' : fmtTime(t).replace(':', '-');
  return `${safe(profileId) || 'profile'}-${safe(cardId ?? 'build')}-${when}.png`;
}

/** The root <svg> tag with `xmlns` (added when missing) and the render size as width and height. */
export function prepareSvg(svg: string, W: number, H: number): string {
  return svg.replace(/^<svg\b[^>]*>/, (tag) => {
    let t = tag.replace(/\s(width|height)="[^"]*"/g, '');
    if (!/\sxmlns="/.test(t)) t = t.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
    return t.replace(/^<svg/, `<svg width="${W}" height="${H}"`);
  });
}

/** The computed properties that draw a board element; board.css sets nothing else. */
const PROPS = [
  'display',
  'visibility',
  'opacity',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'paint-order',
  'font-family',
  'font-size',
  'font-weight',
  'font-variant-numeric',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'vector-effect',
] as const;

/** A serialized clone of the live SVG with each element's computed paint as inline style. */
export function inlineStyles(live: SVGSVGElement): string {
  const clone = live.cloneNode(true) as SVGSVGElement;
  const src = [live, ...Array.from(live.querySelectorAll('*'))];
  const dst = [clone, ...Array.from(clone.querySelectorAll('*'))];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
      .filter(([, val]) => val !== '')
      .map(([p, val]) => `${p}:${val}`)
      .join(';');
    if (style) dst[i]!.setAttribute('style', style);
  });
  return new XMLSerializer().serializeToString(clone);
}

/** Draw the SVG text on a canvas at the scale over the background; null where it cannot. */
export function rasterize(svg: string, W: number, H: number, bg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * SCALE;
      canvas.height = H * SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b), 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Save the blob as a download. Does nothing where the browser has no object URLs. */
export function saveBlob(blob: Blob, name: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Capture the stage's live SVG at its render size (W by H, the stage's measured size) and save
 * it as `name`. Resolves true when the download started.
 */
export async function captureStage(
  live: SVGSVGElement,
  W: number,
  H: number,
  name: string,
): Promise<boolean> {
  const bg = getComputedStyle(live).backgroundColor || '#ffffff';
  const blob = await rasterize(prepareSvg(inlineStyles(live), W, H), W, H, bg);
  if (!blob) return false;
  saveBlob(blob, name);
  return true;
}
