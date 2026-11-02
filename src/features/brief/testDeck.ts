// A test vignette with two cards, for the Brief tests. Card 1 is Plan over the full run with no
// focus; card 2 is 3D at t+200 s focused on the first threat, Reach off.
import { testVignette } from '../../engine/testVignette';
import type { Card, Vignette } from '../../domain/types';

export function testCard(over: Partial<Card> = {}): Card {
  return {
    key: 'k-c1',
    id: 'c1',
    name: 'Overview',
    view: {
      kind: 'plan',
      centre: { x: 0, y: 0 },
      zoom: 1,
      yawDeg: -35,
      pitchDeg: 55,
      ref: 'asset',
      elevationMode: 'fromAsset',
    },
    layers: {},
    displays: { timeline: true, chart: false, readout: false, emphasis: false },
    clip: null,
    focus: [],
    tS: null,
    caption: 'Every ring to scale.',
    notes: 'Say the ranges.',
    ...over,
  };
}

export function testDeck(): Vignette {
  const v = testVignette();
  const t1 = v.threats[0]!.key;
  v.questions = [{ key: 'k-q1', id: 'Q-01', text: 'Does the radar hold the hover?', note: '' }];
  v.cards = [
    testCard(),
    testCard({
      key: 'k-c2',
      id: 'c2',
      name: 'The loiter',
      view: {
        kind: '3d',
        centre: { x: 0, y: 0 },
        zoom: 1,
        yawDeg: -20,
        pitchDeg: 40,
        ref: 'asset',
        elevationMode: 'fromAsset',
      },
      layers: { reach: false },
      focus: [t1],
      tS: 200,
      caption: 'At t+200 s the aircraft hovers.',
      notes: 'Pause here.',
    }),
  ];
  return v;
}
