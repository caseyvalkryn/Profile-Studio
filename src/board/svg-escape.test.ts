// KML/KMZ placemark names feed area labels that land in board SVG via dangerouslySetInnerHTML.
// A crafted name must never produce a raw <script> tag or an unescaped onload= attribute.
import { describe, expect, it } from 'vitest';
import { parseKml, siteAreas } from '../domain/siteFile';
import { derived, preview } from '../engine';
import { testVignette } from '../engine/testVignette';
import { scene } from './render';
import { toScene } from './scene';
import { esc, S } from './svg';

const BAD_SCRIPT = '<script>alert(1)</script>';
const BAD_ONLOAD = '"onload=alert(1)';

/** KML name text: encode so DOMParser keeps the literal payload (a raw <script> child would be stripped). */
const kmlOf = (nameXml: string) =>
  `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>${nameXml}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
  -79,35,0 -78.999,35,0 -78.999,35.001,0 -79,35.001,0 -79,35,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Document></kml>`;

function renderSiteSvg(nameXml: string, expectedLabel: string): { svg: string; label: string } {
  const polygons = parseKml(kmlOf(nameXml));
  const doc = testVignette({
    site: { name: 'xss-site', lat: 35, lon: -79, elevM: 0 },
    areas: [],
  });
  const { areas } = siteAreas(doc, polygons, 'site');
  expect(areas.length).toBeGreaterThan(0);
  expect(areas[0]!.label).toBe(expectedLabel);
  const withAreas = { ...doc, areas };
  const sc = toScene(withAreas);
  const d = derived(withAreas, preview(withAreas));
  const out = scene(sc, { proj: 'plan', t: 0 }, { W: 600, H: 400 }, { derived: d });
  return { svg: out.svg, label: areas[0]!.label };
}

describe('svg escaping for imported site labels', () => {
  it('escapes attribute values; callers escape text content with esc()', () => {
    expect(esc(BAD_SCRIPT)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc(BAD_ONLOAD)).toBe('&quot;onload=alert(1)');
    // S() escapes attrs; inner is the caller's responsibility (sym.label passes esc(text)).
    expect(S('text', { title: BAD_ONLOAD }, esc(BAD_SCRIPT))).toBe(
      '<text title="&quot;onload=alert(1)">&lt;script&gt;alert(1)&lt;/script&gt;</text>',
    );
  });

  it('KML script placemark name does not appear as a raw script tag in board SVG', () => {
    const { svg, label } = renderSiteSvg('&lt;script&gt;alert(1)&lt;/script&gt;', BAD_SCRIPT);
    expect(label).toBe(BAD_SCRIPT);
    expect(svg.toLowerCase()).not.toMatch(/<script[\s>]/);
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('KML onload placemark name does not appear as a raw onload attribute in board SVG', () => {
    const { svg, label } = renderSiteSvg('"onload=alert(1)', BAD_ONLOAD);
    expect(label).toBe(BAD_ONLOAD);
    // Attribute values go through esc(); a crafted quote must not break out into onload=.
    expect(svg).not.toMatch(/\sonload\s*=/i);
    expect(svg).toContain('&quot;onload=alert(1)');
  });
});
