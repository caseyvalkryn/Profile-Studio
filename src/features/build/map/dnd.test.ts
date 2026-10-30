import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { ASSET_MIME, encodeAssetPayload, parseAssetPayload } from './dnd';
import { placeItem } from './place';

describe('asset drop payload', () => {
  it('uses one MIME type shared with the asset library', () => {
    expect(ASSET_MIME).toBe('application/x-profile-studio-asset');
  });

  it('parses group plus type, member kinds alone, and threats', () => {
    expect(parseAssetPayload(encodeAssetPayload({ kind: 'sensor', type: 'radar' }))).toEqual({
      group: 'sensor',
      kind: 'radar',
    });
    expect(parseAssetPayload('{"kind":"kinetic"}')).toEqual({ group: 'effector', kind: 'kinetic' });
    expect(parseAssetPayload('{"kind":"asset"}')).toEqual({ group: 'area', kind: 'asset' });
    expect(parseAssetPayload('{"kind":"threat","type":"g1-fpv-fiber"}')).toEqual({
      group: 'threat',
      type: 'g1-fpv-fiber',
    });
  });

  it('rejects malformed and mismatched payloads', () => {
    expect(parseAssetPayload('not json')).toBeNull();
    expect(parseAssetPayload('{"kind":"sensor","type":"kinetic"}')).toBeNull();
    expect(parseAssetPayload('{"kind":"tank"}')).toBeNull();
    expect(parseAssetPayload('')).toBeNull();
  });
});

describe('placement', () => {
  beforeEach(() => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
  });

  it('a drop is one document edit with a minted key and the next display id', () => {
    const item = parseAssetPayload(encodeAssetPayload({ kind: 'sensor', type: 'radar' }))!;
    const r = placeItem(item, { x: 1200, y: -340 });
    expect('key' in r).toBe(true);
    const doc = useDocument.getState().doc!;
    const s = doc.sensors[doc.sensors.length - 1]!;
    expect(s).toMatchObject({ kind: 'radar', id: 'RDR-1', x: 1200, y: -340 });
    expect(s.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(useUi.getState().selectedKeys).toEqual([s.key]);
    expect(useDocument.getState().history).toHaveLength(1);
    useDocument.getState().undo();
    expect(useDocument.getState().doc!.sensors).toHaveLength(2);
  });

  it('a threat drop asks for path drawing instead of editing', () => {
    expect(placeItem({ group: 'threat', type: 'g1-quad-isr' }, { x: 0, y: 0 })).toEqual({
      draw: 'g1-quad-isr',
    });
    expect(useDocument.getState().history).toHaveLength(0);
  });
});
