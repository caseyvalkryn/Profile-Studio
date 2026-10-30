import { testVignette } from '../engine/testVignette';
import { previewOf, useDocument } from './document';

const doc = () => useDocument.getState();

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
    expect(doc().doc).toEqual(before);
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
    expect(doc().doc).toEqual(after);
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
    expect(doc().doc).toEqual(before);
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

  it('memoises the preview on the document reference', () => {
    const v = doc().doc!;
    expect(previewOf(v)).toBe(previewOf(v));
    doc().edit('x', (d) => {
      d.sensors[0]!.x = 5;
    });
    expect(previewOf(doc().doc!)).not.toBe(previewOf(v));
  });
});
