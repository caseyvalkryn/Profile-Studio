import '../../../ui/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { testVignette } from '../../../engine/testVignette';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import Board, { mounted } from '../board/Board';
import { boardFlush } from '../board/renderer';
import { BOARD_DEFAULTS, useBoard } from '../board/store';
import { useQuickAdd } from '../palette/store';
import BuildBar from './BuildBar';

function mount() {
  render(
    <>
      <BuildBar />
      <Board width={900} height={600} />
    </>,
  );
  act(() => boardFlush());
  return screen.getByTestId('board-stage');
}

function clickAt(stage: HTMLElement, x: number, y: number) {
  const cam = [...mounted][0]!.renderer.last!.cam;
  const [sx, sy] = cam.project(x, y, 0);
  const init = {
    clientX: sx,
    clientY: sy,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  };
  fireEvent.pointerDown(stage, init);
  fireEvent.pointerUp(stage, init);
  act(() => boardFlush());
}

describe('Build bar, Add waypoints (lane 11.1)', () => {
  beforeEach(() => {
    useDocument.getState().open(testVignette());
    useUi.setState({ ...UI_DEFAULTS });
    useBoard.setState({ ...BOARD_DEFAULTS });
    useQuickAdd.setState({ boardArmed: null });
  });

  it('with a threat selected, the clicks append to its path and add no threat', () => {
    const stage = mount();
    const t0 = useDocument.getState().doc!.threats[0]!;
    const n0 = t0.path.length;
    const threats0 = useDocument.getState().doc!.threats.length;
    act(() => useUi.getState().setSelection([t0.key]));
    fireEvent.click(screen.getByRole('button', { name: 'Add waypoints' }));
    expect(useBoard.getState().placing?.pathId).toBe(t0.id);
    clickAt(stage, 1200, 800);
    clickAt(stage, 1500, 400);
    const doc = useDocument.getState().doc!;
    expect(doc.threats.length).toBe(threats0);
    expect(doc.threats[0]!.path.length).toBe(n0 + 2);
    // a second press disarms
    fireEvent.click(screen.getByRole('button', { name: 'Add waypoints' }));
    expect(useBoard.getState().placing).toBeNull();
    expect(useUi.getState().armed).toBeNull();
  });

  it('Escape ends an append placement and keeps the waypoints placed', () => {
    const stage = mount();
    const t0 = useDocument.getState().doc!.threats[0]!;
    const n0 = t0.path.length;
    act(() => useUi.getState().setSelection([t0.key]));
    fireEvent.click(screen.getByRole('button', { name: 'Add waypoints' }));
    expect(useUi.getState().drawing).toBe(true);
    clickAt(stage, 1200, 800);
    act(() => useUi.getState().signalPath('cancel'));
    expect(useBoard.getState().placing).toBeNull();
    expect(useUi.getState().armed).toBeNull();
    expect(useUi.getState().drawing).toBe(false);
    expect(useDocument.getState().doc!.threats[0]!.path.length).toBe(n0 + 1);
  });

  it('with no threat selected, the clicks place a new threat', () => {
    const stage = mount();
    const doc0 = useDocument.getState().doc!;
    const threats0 = doc0.threats.length;
    const paths0 = doc0.threats.map((t) => t.path.length);
    fireEvent.click(screen.getByRole('button', { name: 'Add waypoints' }));
    expect(useBoard.getState().placing?.kind).toBe('aircraft');
    expect(useBoard.getState().placing?.pathId).toBeUndefined();
    clickAt(stage, 1200, 800);
    clickAt(stage, 1500, 400);
    act(() => useUi.getState().signalPath('finish'));
    const doc = useDocument.getState().doc!;
    expect(doc.threats.length).toBe(threats0 + 1);
    expect(doc.threats.at(-1)!.path.length).toBe(2);
    expect(doc.threats.slice(0, threats0).map((t) => t.path.length)).toEqual(paths0);
    expect(useBoard.getState().placing).toBeNull();
  });
});
