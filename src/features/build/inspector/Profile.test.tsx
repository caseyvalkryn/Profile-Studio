import '../../../ui/test-utils';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { testVignette } from '../../../engine/testVignette';
import type { VignetteListing } from '../../../state/persist';
import { Purpose } from './Profile';

const persist = vi.hoisted(() => ({
  listed: null as Partial<VignetteListing>[] | null,
  listVignettes: vi.fn(async () => []),
}));

vi.mock('../../../state/persist', async (orig) => ({
  ...(await orig<typeof import('../../../state/persist')>()),
  lastListing: () => persist.listed,
  listVignettes: persist.listVignettes,
}));

describe('Profile, useCollections (lane 11.1)', () => {
  it('reads the cached listing and does not list the store again', () => {
    persist.listed = [{ collection: 'Range B' }, { collection: 'Range A' }];
    const v = { ...testVignette(), collection: 'Range C' };
    const { container } = render(<Purpose v={v} />);
    const opts = [...container.querySelectorAll('#inspector-collections option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(opts).toEqual(['Range A', 'Range B', 'Range C']);
    expect(persist.listVignettes).not.toHaveBeenCalled();
  });
});
