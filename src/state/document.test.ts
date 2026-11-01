import { testVignette } from '../engine/testVignette';
import type { Vignette } from '../domain/types';
import { previewOf, useDocument } from './document';

const doc = () => useDocument.getState();
/** The document without its `updated` stamp, which is set outside history. */
const body = (v: Vignette | null) => (v ? { ...v, updated: '' } : v);

beforeEach(() => doc().open(testVignette()));

describe('document store', () => {
  it('edit then undo restores the document deep-equal', () => {
    const before = doc().doc;
    doc().edit('Move radar', (d) => {
      d.sensors[0]!.x = 123;
      d.threats.pop();
    });
    expect(doc().doc!.sensors[0]!.x).toBe(123);
    expect(doc().history).toEqual(['Move radar']);
    expect(doc().canUndo).toBe(true);
    doc().undo();
    expect(body(doc().doc)).toEqual(body(before));
    expect(doc().canUndo).toBe(false);
    expect(doc().canRedo).toBe(true);
  });

  it('redo reapplies the edit', () => {
    doc().edit('Range', (d) => {
      d.sensors[0]!.rangeM = 999;
    });
    const after = doc().doc;
    doc().undo();
    doc().redo();
    expect(body(doc().doc)).toEqual(body(after));
    expect(doc().canRedo).toBe(false);
  });

  it('a drag of 10 updates is one undo step', () => {
    const before = doc().doc;
    doc().beginDrag('Drag waypoint');
    for (let i = 1; i <= 10; i++)
      doc().updateDrag((d) => {
        d.threats[0]!.path[0]!.x = i * 10;
      });
    expect(doc().doc!.threats[0]!.path[0]!.x).toBe(100);
    expect(doc().history).toEqual([]);
    doc().endDrag();
    expect(doc().history).toEqual(['Drag waypoint']);
    doc().undo();
    expect(body(doc().doc)).toEqual(body(before));
    doc().redo();
    expect(doc().doc!.threats[0]!.path[0]!.x).toBe(100);
  });

  it('cancelDrag reverts and adds no step', () => {
    const before = doc().doc;
    doc().beginDrag('Drag ring');
    doc().updateDrag((d) => {
      d.sensors[0]!.rangeM = 1;
    });
    doc().cancelDrag();
    expect(doc().doc).toBe(before);
    expect(doc().canUndo).toBe(false);
  });

  it('a new edit clears redo', () => {
    doc().edit('a', (d) => {
      d.name = 'a';
    });
    doc().undo();
    doc().edit('b', (d) => {
      d.name = 'b';
    });
    expect(doc().canRedo).toBe(false);
  });

  it('a no-op edit adds no step and keeps the document reference', () => {
    const before = doc().doc;
    doc().edit('noop', () => {});
    doc().edit('same name', (d) => {
      d.name = before!.name;
    });
    expect(doc().history).toEqual([]);
    expect(doc().doc).toBe(before);
  });

  it('stamps updated on a change, and undo does not rewind it', () => {
    doc().open({ ...doc().doc!, updated: '2000-01-01T00:00:00.000Z' });
    doc().edit('Rename', (d) => {
      d.name = 'x';
    });
    const stamped = doc().doc!.updated;
    expect(stamped > '2000').toBe(true);
    doc().undo();
    expect(doc().doc!.name).toBe('test vignette');
    expect(doc().doc!.updated >= stamped).toBe(true);
  });

  it('memoises the preview on the document reference', () => {
    const v = doc().doc!;
    expect(previewOf(v)).toBe(previewOf(v));
    doc().edit('x', (d) => {
      d.sensors[0]!.x = 5;
    });
    expect(previewOf(doc().doc!)).not.toBe(previewOf(v));
  });
});

describe('previewOf group keys', () => {
  it('clusters only the threats that carry a group letter', async () => {
    const { preview } = await import('../engine/preview');
    const loose = testVignette();
    // No threat is grouped: no link distance and no splits, unlike the every-threat default.
    expect(previewOf(loose).dLink.value).toBeNull();
    expect(preview(loose).dLink.value).not.toBeNull();
    const grouped = testVignette({
      threats: testVignette().threats.map((t) => ({ ...t, group: 'A' })),
    });
    expect(previewOf(grouped).dLink).toEqual(
      preview(grouped, { groupKeys: grouped.threats.map((t) => t.key) }).dLink,
    );
    expect(previewOf(grouped).dLink.value).not.toBeNull();
  });
});
