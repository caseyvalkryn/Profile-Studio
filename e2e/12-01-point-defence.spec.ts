import { expect, test } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE, runOnce } from './helpers';

test('12.1 A new user opens "Point defence, single quadrotor", runs it, and sees 1.1.2 with a value, interval, threshold and evaluation.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  await runOnce(page, 'R-1');
  await goTo(page, 'Results');

  const row = page
    .getByRole('table', { name: 'Scorecard' })
    .getByRole('row', { name: /^1\.1\.2 / });
  await expect(row).toBeVisible();
  const cells = row.getByRole('cell');
  await expect(cells.nth(0)).toHaveText('1.1.2');
  await expect(cells.nth(1)).toHaveText('Detection Range (ground)');
  await expect(cells.nth(2)).toHaveText(/^\d[\d.,]* nm$/); // value
  await expect(cells.nth(3)).toHaveText(/^\[\d[\d.,]*, \d[\d.,]*\]$/); // 95 % interval
  await expect(cells.nth(4)).toHaveText(/^[≥≤] \d[\d.,]* nm$/); // threshold
  await expect(cells.nth(5)).toHaveText(/^(Meets|Does not meet|Inconclusive)$/); // evaluation
});
