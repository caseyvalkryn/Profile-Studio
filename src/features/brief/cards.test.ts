import { cameras, render } from '../../board';
import type { Card } from '../../domain/types';
import { boardDerived, boardScene } from '../build/board/derived';
import { BOARD_DEFAULTS, useBoard } from '../build/board/store';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { useToast } from '../shell/toastStore';
import {
  addCard,
  applyCard,
  cardFromBuild,
  currentIndex,
  deleteCard,
  moveCard,
  nextCardId,
  restoreBuild,
  setFocusIds,
  setSlice,
  sliceFromLoop,
  snapshotCard,
  stashBuild,
  step,
} from './cards';
import { testDeck } from './testDeck';
import { toCardRec } from './toCardRec';
import { applyCard as openInBuild, setBoardCam } from '../build/cards/cards';

beforeEach(() => {
  useUi.setState(UI_DEFAULTS);
  useBoard.setState({ ...BOARD_DEFAULTS });
  useDocument.getState().open(testDeck());
});

const doc = () => useDocument.getState().doc!;
const ids = () => doc().cards.map((c) => c.id);

describe('the current card', () => {
  it('is the keyed card, else the first; -1 for an empty deck', () => {
    expect(currentIndex(doc().cards, null)).toBe(0);
    expect(currentIndex(doc().cards, 'k-c2')).toBe(1);
    expect(currentIndex(doc().cards, 'gone')).toBe(0);
    expect(currentIndex([], 'k-c1')).toBe(-1);
  });

  it('steps forward and back, wrapping, and applies the card view and time', () => {
    step(1);
    expect(useUi.getState().cardKey).toBe('k-c2');
    expect(useUi.getState().view).toBe('3d');
    expect(useUi.getState().timeOn).toBe(true);
    expect(useUi.getState().tS).toBe(200);
    expect(useUi.getState().selectedKeys).toEqual([doc().threats[0]!.key]);
    expect(useBoard.getState()).toMatchObject({ yaw: -20, pitch: 40, layers: { reach: false } });
    step(1);
    expect(useUi.getState().cardKey).toBe('k-c1');
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().timeOn).toBe(false);
    step(-1);
    expect(useUi.getState().cardKey).toBe('k-c2');
  });
});

describe('the Build stash', () => {
  it('stashes once on entry and restores on leave', () => {
    useUi.getState().setView('elevation');
    useUi.getState().setTime(42);
    useUi.getState().setTimeOn(true);
    useBoard
      .getState()
      .set({ yaw: 10, pitch: 70, zoom: 2, px: 5, py: 6, layers: { labels: false } });
    stashBuild();
    applyCard(doc(), doc().cards[1]!);
    expect(useUi.getState().view).toBe('3d');
    stashBuild(); // a second entry does not overwrite
    restoreBuild();
    expect(useUi.getState()).toMatchObject({
      view: 'elevation',
      tS: 42,
      timeOn: true,
      buildStash: null,
    });
    expect(useBoard.getState()).toMatchObject({
      yaw: 10,
      pitch: 70,
      zoom: 2,
      px: 5,
      py: 6,
      layers: { labels: false },
    });
  });

  it('restores the loop and rate a slice card changed (lane 13.W)', () => {
    useUi.getState().setLoop({ startS: 10, endS: 20 });
    useUi.getState().setRate(2);
    stashBuild();
    useUi.getState().setLoop({ startS: 60, endS: 120 });
    useUi.getState().setRate(8);
    restoreBuild();
    expect(useUi.getState()).toMatchObject({ loop: { startS: 10, endS: 20 }, rate: 2 });

    useUi.getState().setLoop(null);
    stashBuild();
    useUi.getState().setLoop({ startS: 60, endS: 120 });
    restoreBuild();
    expect(useUi.getState().loop).toBeNull();
  });
});

describe('the card frame (lane 11.1)', () => {
  it('a card added from a stashed Plan view keeps its zoom and centre', () => {
    useBoard.getState().set({ zoom: 1, px: 0, py: 0 });
    expect(cardFromBuild(doc()).view).toMatchObject({ centre: { x: 0, y: 0 }, zoom: 1 });
    useBoard.getState().set({ zoom: 2, px: 0, py: 0 });
    stashBuild();
    useBoard.getState().set({ zoom: 1 }); // the live board moved on; the stash is the source
    addCard();
    const c = doc().cards.at(-1)!;
    expect(c.view.zoom).toBe(2);
    useUi.getState().setBuildStash(null);
    // a pan right by 200 px moves the middle of the board west of the fitted middle
    useBoard.getState().set({ zoom: 1, px: 200, py: 0 });
    const v = cardFromBuild(doc()).view;
    expect(v.centre.x).toBeLessThan(0);
    expect(v.centre.y).toBe(0);
  });

  it('a card added from a stashed 3D view keeps the fitted frame and says so', () => {
    useUi.getState().setView('3d');
    useBoard.getState().set({ zoom: 2, px: 30, py: -10, yaw: 15, pitch: 50 });
    stashBuild();
    addCard();
    const c = doc().cards.at(-1)!;
    // 3D keeps its frame too: the zoom, and the ground point at the middle as the centre
    expect(c.view).toMatchObject({ kind: '3d', zoom: 2, yawDeg: 15, pitchDeg: 50 });
    expect(c.view.centre).not.toEqual({ x: 0, y: 0 });
  });
});

describe('card edits', () => {
  it('adds a card from the stashed Build view in one undo step and opens it', () => {
    useUi.getState().setView('elevation');
    useUi.getState().setTime(30);
    useUi.getState().setTimeOn(true);
    useUi.getState().setSelection([doc().sensors[0]!.key]);
    useBoard.getState().set({ ref: 'S-01', layers: { reach: false } });
    stashBuild();
    const before = useDocument.getState().past.length;
    addCard();
    const cards = doc().cards;
    expect(cards).toHaveLength(3);
    const c = cards[2]!;
    expect(c).toMatchObject({
      id: 'c3',
      name: 'Card 3',
      tS: 30,
      focus: [doc().sensors[0]!.key],
      layers: { reach: false },
      caption: '',
      notes: '',
      clip: null,
      displays: { timeline: true, chart: false, readout: false, emphasis: false },
    });
    expect(c.view).toMatchObject({ kind: 'elevation', ref: doc().sensors[0]!.key });
    expect(useDocument.getState().past.length).toBe(before + 1);
    expect(useDocument.getState().history.at(-1)).toBe('add card c3');
    expect(useUi.getState().cardKey).toBe(c.key);
  });

  it('mints the lowest unused card id', () => {
    expect(nextCardId(doc().cards)).toBe('c3');
    expect(nextCardId([doc().cards[1]!])).toBe('c1');
  });

  it('moves the current card up and down, one undo step each, and stops at the ends', () => {
    useUi.getState().setCardKey('k-c2');
    moveCard(-1);
    expect(ids()).toEqual(['c2', 'c1']);
    expect(useDocument.getState().history.at(-1)).toBe('move card c2 up');
    moveCard(-1);
    expect(ids()).toEqual(['c2', 'c1']);
    expect(useDocument.getState().past).toHaveLength(1);
    moveCard(1);
    expect(ids()).toEqual(['c1', 'c2']);
    expect(useDocument.getState().history.at(-1)).toBe('move card c2 down');
    useDocument.getState().undo();
    expect(ids()).toEqual(['c2', 'c1']);
  });

  it('deletes the current card with undo and moves to the neighbour', () => {
    useUi.getState().setCardKey('k-c1');
    deleteCard();
    expect(ids()).toEqual(['c2']);
    expect(useUi.getState().cardKey).toBe('k-c2');
    expect(useDocument.getState().history.at(-1)).toBe('delete card c1');
    useDocument.getState().undo();
    expect(ids()).toEqual(['c1', 'c2']);
    deleteCard(); // k-c2 is current
    deleteCard();
    expect(ids()).toEqual([]);
    expect(useUi.getState().cardKey).toBeNull();
  });

  it('sets the focus from display ids, dropping unknown ones', () => {
    setFocusIds(doc(), 'k-c1', 'T-01, S-02 nothing');
    expect(doc().cards[0]!.focus).toEqual([doc().threats[0]!.key, doc().sensors[1]!.key]);
    expect(useDocument.getState().history.at(-1)).toBe('set card c1 focus');
  });

  it('a card from Build stores the time only while the cursor is on', () => {
    useUi.getState().setTime(50);
    expect(cardFromBuild(doc()).tS).toBeNull();
    useUi.getState().setTimeOn(true);
    expect(cardFromBuild(doc()).tS).toBe(50);
  });
});

describe('the card frame on the stage, the strip and print (lane 11.F, F-02)', () => {
  const SZ = { W: 800, H: 450 };
  // S-01's glyph centre in the card render, less the middle of the render
  function glyph(card: Card): [number, number] {
    const svg = render.card(boardScene(doc()), boardDerived(doc()), toCardRec(doc(), card), SZ);
    const m = svg.match(
      /data-id="S-01" data-role="centre"><g[^>]*><circle cx="([-\d.]+)" cy="([-\d.]+)"/,
    );
    if (!m) throw new Error('no S-01 glyph');
    return [Number(m[1]) - SZ.W / 2, Number(m[2]) - SZ.H / 2];
  }
  const at = (view: Partial<Card['view']>): Card => {
    const c = doc().cards[0]!;
    return { ...c, view: { ...c.view, ...view } };
  };

  it('draws a Plan card at its stored zoom and centre, and a 3D card at its stored frame', () => {
    expect(doc().cards[0]!.view.kind).toBe('plan');
    expect(toCardRec(doc(), at({ zoom: 2, centre: { x: 100, y: -50 } })).cam).toMatchObject({
      zoom: 2,
      centre: { x: 100, y: -50 },
    });
    const [fx, fy] = glyph(at({ zoom: 1, centre: { x: 0, y: 0 } }));
    const [zx, zy] = glyph(at({ zoom: 2, centre: { x: 0, y: 0 } }));
    expect(zx).toBeCloseTo(2 * fx, 0);
    expect(zy).toBeCloseTo(2 * fy, 0);
    // the centre 100 m east puts the middle of the render 100 m east: S-01 moves west on screen
    const [cx, cy] = glyph(at({ zoom: 2, centre: { x: 100, y: 0 } }));
    expect(cx).toBeLessThan(zx - 1);
    expect(cy).toBeCloseTo(zy, 0);
    const cam = cameras.get('plan').setup(boardScene(doc()).scene, boardDerived(doc()), SZ, {
      zoom: 2,
      ref: 'asset',
    });
    expect(zx - cx).toBeCloseTo(100 * cam.scale, 0);
    // 3D draws the stored frame too: a zoom and a centre change the render
    const d3 = doc().cards[1]!;
    expect(d3.view.kind).toBe('3d');
    const r = (c: Card) =>
      render.card(boardScene(doc()), boardDerived(doc()), toCardRec(doc(), c), SZ);
    expect(r({ ...d3, view: { ...d3.view, zoom: 3, centre: { x: 500, y: 0 } } })).not.toBe(r(d3));
    expect(r({ ...d3, view: { ...d3.view, zoom: 1, centre: { x: 0, y: 0 } } })).toBe(r(d3));
  });

  it('opens in Build (card.open) at the frame the stage draws', () => {
    const c = at({ zoom: 2, centre: { x: 100, y: -40 } });
    const cam = cameras.get('plan').setup(boardScene(doc()).scene, boardDerived(doc()), SZ, {});
    setBoardCam(() => ({ cam, W: SZ.W, H: SZ.H }));
    try {
      openInBuild(c);
    } finally {
      setBoardCam(() => null);
    }
    const b = useBoard.getState();
    expect(b.zoom).toBe(2);
    const svg = render.scene(
      boardScene(doc()),
      { proj: 'plan', zoom: b.zoom, px: b.px, py: b.py, ref: b.ref, layers: c.layers },
      SZ,
      { derived: boardDerived(doc()) },
    ).svg;
    const m = svg.match(
      /data-id="S-01" data-role="centre"><g[^>]*><circle cx="([-\d.]+)" cy="([-\d.]+)"/,
    )!;
    const [gx, gy] = glyph(c);
    expect(Number(m[1]) - SZ.W / 2).toBeCloseTo(gx, 0);
    expect(Number(m[2]) - SZ.H / 2).toBeCloseTo(gy, 0);
  });
});

describe('the slice (lane 13.2)', () => {
  const slice = { t0S: 10, t1S: 40, rate: 2, beatsS: [] };
  const hist = () => useDocument.getState().history;

  it('setSlice writes the slice and its start as the card time in one undo step; null clears it', () => {
    expect(setSlice('k-c2', slice)).toBe(true);
    expect(doc().cards[1]).toMatchObject({ clip: slice, tS: 10 });
    expect(hist()).toEqual(['set card c2 slice']);
    expect(setSlice('k-c2', { ...slice, t1S: 5 })).toBe(false);
    expect(hist()).toHaveLength(1);
    setSlice('k-c2', null);
    expect(doc().cards[1]).toMatchObject({ clip: null, tS: 10 });
    useDocument.getState().undo();
    expect(doc().cards[1]!.clip).toEqual(slice);
  });

  it('sliceFromLoop with no loop changes nothing and says how to set one', () => {
    expect(sliceFromLoop()).toBeNull();
    expect(hist()).toEqual([]);
    expect(useToast.getState().text).toBe('Set a loop on the timeline first (Shift and drag).');
  });

  it('sliceFromLoop in Brief takes the loop and the rate into the current card', () => {
    useUi.setState({
      workspace: 'brief',
      cardKey: 'k-c2',
      loop: { startS: 60, endS: 120 },
      rate: 4,
    });
    expect(sliceFromLoop()).toBe('k-c2');
    expect(doc().cards[1]!.clip).toEqual({ t0S: 60, t1S: 120, rate: 4, beatsS: [] });
    expect(hist()).toEqual(['set card c2 slice']);
    expect(useToast.getState().text).toBe('Slice t+1:00 to t+2:00 · x4 set on card c2.');
  });

  it('sliceFromLoop in Build saves a new card after the current one', () => {
    useUi.setState({
      workspace: 'build',
      cardKey: 'k-c1',
      loop: { startS: 60, endS: 120 },
      rate: 2,
    });
    const key = sliceFromLoop();
    expect(ids()).toEqual(['c1', 'c3', 'c2']);
    expect(doc().cards[1]).toMatchObject({
      key,
      tS: 60,
      clip: { t0S: 60, t1S: 120, rate: 2, beatsS: [] },
    });
    expect(hist()).toEqual(['save slice c3']);
    expect(useUi.getState().cardKey).toBe(key);
  });

  it('applyCard sets the loop, rate and time of a slice, and a frame clears the loop', () => {
    setSlice('k-c2', slice);
    openInBuild(doc().cards[1]!);
    expect(useUi.getState()).toMatchObject({
      loop: { startS: 10, endS: 40 },
      rate: 2,
      tS: 10,
      timeOn: true,
    });
    useUi.getState().setTime(30);
    openInBuild(doc().cards[0]!);
    expect(useUi.getState()).toMatchObject({ loop: null, timeOn: false, tS: 30 });
  });

  it('a frame saved inside a slice keeps the frame only', () => {
    setSlice('k-c2', slice);
    useUi.setState({ workspace: 'brief', cardKey: 'k-c2', tS: 25, timeOn: true });
    snapshotCard();
    expect(doc().cards[2]).toMatchObject({ id: 'c3', tS: 25, clip: null });
  });
});
