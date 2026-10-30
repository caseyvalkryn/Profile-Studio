import '../../../ui/test-utils';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import { previewOf, useDocument } from '../../../state/document';
import { UI_DEFAULTS, useUi } from '../../../state/ui';
import ProfileView from './ProfileView';

const view = () => <ProfileView width={600} height={240} />;

beforeEach(() => {
  useDocument.getState().open(testVignette());
  useUi.setState({ ...UI_DEFAULTS });
});

describe('ProfileView', () => {
  it('asks for a selection when none is made', () => {
    render(view());
    expect(screen.getByText('Select a flight path to see its profile')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-svg')).toBeNull();
  });

  it('draws a two-waypoint path as one line with two dots', () => {
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(view());
    const d = screen.getByTestId('profile-line').getAttribute('d')!;
    expect(d.match(/[ML]/g)).toEqual(['M', 'L']);
    expect(screen.getAllByTestId('profile-waypoint')).toHaveLength(2);
    expect(screen.getByTestId('profile-now')).toBeInTheDocument();
  });

  it('resolves a selected waypoint to its path and labels a hold', () => {
    useDocument.getState().edit('Hold', (d) => {
      const p = d.threats[0]!.path;
      p.splice(1, 0, { key: 'T-01-m', x: 0, y: 3000, z: 100, holdS: 30 });
    });
    useUi.setState({ selectedKeys: ['T-01-m'] });
    render(view());
    expect(screen.getAllByTestId('profile-waypoint')).toHaveLength(3);
    expect(screen.getByTestId('profile-hold')).toHaveTextContent('hold 30 s');
  });

  it('draws one coverage band per sensor that covers the path', () => {
    const p = previewOf(useDocument.getState().doc!);
    const covering = Object.entries(p.windows)
      .filter(([k, byThreat]) => k.startsWith('k-S') && (byThreat['k-T-01'] ?? []).length > 0)
      .map(([k]) => k.slice(2));
    expect(covering.length).toBeGreaterThan(0);
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(view());
    const bands = screen.getAllByTestId('profile-band').map((b) => b.getAttribute('data-sensor'));
    expect(bands).toEqual(covering);
  });

  it('the units toggle changes the axis labels', () => {
    useUi.setState({ selectedKeys: ['k-T-01'] });
    render(view());
    expect(screen.getByText('Along-track distance (nm)')).toBeInTheDocument();
    expect(screen.getByText('Altitude (ft AGL)')).toBeInTheDocument();
    act(() => useUi.getState().setUnits('si'));
    expect(screen.getByText('Along-track distance (km)')).toBeInTheDocument();
    expect(screen.getByText('Altitude (m AGL)')).toBeInTheDocument();
  });
});
