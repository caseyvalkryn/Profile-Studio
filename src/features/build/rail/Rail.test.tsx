import '../../../ui/test-utils';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import fixture from '../../../../fixtures/legacy-derive/CUAS-001.json';
import { importLegacyV4 } from '../../../domain/migrate';
import { useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import { useQuickAdd } from '../palette/store';
import { Rail } from './Rail';
import { hDist, num, spd, tText, vBare, vHeight } from './format';

const seed = () => importLegacyV4(JSON.parse(JSON.stringify(fixture.input)));

function rowTexts(section: HTMLElement) {
  return [...section.querySelectorAll('button[data-key]')].map((b) =>
    [...b.querySelectorAll('span')].map((s) => s.textContent),
  );
}

describe('Rail', () => {
  beforeEach(() => {
    act(() => {
      useUi.setState({ ...UI_DEFAULTS });
      useDocument.getState().open(seed());
      useQuickAdd.setState({ scope: null });
    });
  });

  it('lists every record of CUAS-001 by spec group with its values', () => {
    render(<Rail />);
    const nav = screen.getByRole('navigation', { name: 'Scene' });
    const sections = within(nav).getAllByRole('region');
    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Threats',
      'Sensors',
      'Effectors',
      'C2 and TSPI',
      'Areas',
      'Height planes',
      'Events',
    ]);
    const [threats, sensors, effectors, nodes, areas, planes, events] = sections.map(rowTexts);
    expect(threats).toEqual([['T1', 'Quadrotor ISR', '23 kt  394 ft']]);
    expect(sensors).toEqual([
      ['RDR-1', '3D radar', '2.16 nm'],
      ['RF-1', 'RF detector', '1.62 nm'],
      ['EO-1', 'EO/IR', '1.35 nm  30°'],
    ]);
    expect(effectors).toEqual([['EW-1', 'RF effector', '0.81 nm']]);
    expect(nodes).toEqual([]);
    expect(areas).toEqual([['DA', 'Defended asset']]);
    expect(planes).toEqual([['P1', '120 m ceiling', '394 ft AGL']]);
    expect(events!.map((r) => [r[0], r[2]])).toEqual([
      ['e1 D', 't+0:28'],
      ['e2 T', 't+0:46'],
      ['e3 I', 't+2:30'],
      ['e4 L', 't+2:58'],
      ['e5 E', 't+4:22'],
      ['e6 C', 't+5:00'],
    ]);
    expect(events![0]![1]).toBe('T1');
    expect(within(sections[3]!).getByText('None.')).toBeInTheDocument();
  });

  it('selects on click, follows the store and sets hover', () => {
    render(<Rail />);
    const rdr = screen.getByRole('button', { name: /RDR-1/ });
    fireEvent.click(rdr);
    const key = useDocument.getState().doc!.sensors[0]!.key;
    expect(useUi.getState().selectedKeys).toEqual([key]);
    expect(rdr).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerEnter(rdr);
    expect(useUi.getState().hoverKey).toBe(key);
    fireEvent.pointerLeave(rdr);
    expect(useUi.getState().hoverKey).toBeNull();
    const ew = useDocument.getState().doc!.effectors[0]!.key;
    act(() => useUi.getState().setSelection([ew]));
    expect(screen.getByRole('button', { name: /EW-1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(rdr).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the palette on a group from its add button, and hides on panels.list', () => {
    render(<Rail />);
    fireEvent.click(document.querySelector('[data-add="sensors"]')!);
    expect(useUi.getState().paletteOpen).toBe(true);
    expect(useQuickAdd.getState().scope).toBe('sensors');
    fireEvent.click(screen.getByRole('button', { name: 'Hide the scene list' }));
    expect(useUi.getState().panels.list).toBe(false);
    expect(screen.queryByRole('navigation', { name: 'Scene' })).toBeNull();
  });

  it('formats the legacy unit strings', () => {
    expect(num(1234.5, 1)).toBe('1,234.5');
    expect(hDist(4000, 'nav')).toBe('2.16 nm');
    expect(hDist(25000, 'si')).toBe('25.0 km');
    expect(vHeight(120, 'nav')).toBe('394 ft AGL');
    expect(vHeight(120, 'si')).toBe('120 m');
    expect(vBare(120, 'si')).toBe('120 m');
    expect(spd(12, 'nav')).toBe('23 kt');
    expect(tText(150)).toBe('t+2:30');
    expect(tText(null)).toBe('full run');
  });
});
