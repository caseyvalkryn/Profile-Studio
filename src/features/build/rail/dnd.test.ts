import { ASSET_MIME, encodeAssetPayload, parseAssetPayload } from './dnd';

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
