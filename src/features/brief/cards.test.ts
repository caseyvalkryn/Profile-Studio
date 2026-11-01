import { BOARD_DEFAULTS, useBoard } from '../build/board/store';
import { useDocument } from '../../state/document';
import { UI_DEFAULTS, useUi } from '../../state/ui';
import { useToast } from '../shell/toastStore';
import {
  ADDED_TOAST_3D,
  addCard,
  applyCard,
  cardFromBuild,
  currentIndex,
  deleteCard,
  moveCard,
  nextCardId,
  restoreBuild,
  setFocusIds,
  stashBuild,
  step,
} from './cards';
import { testDeck } from './testDeck';

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
    expect(c.view).toMatchObject({
      kind: '3d',
      centre: { x: 0, y: 0 },
      zoom: 1,
      yawDeg: 15,
      pitchDeg: 50,
    });
    expect(useToast.getState().text).toBe(ADDED_TOAST_3D);
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
