import { expect, test } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE, runOnce } from './helpers';

test('F-01 Two profiles in one session: Results for the second shows no runs of the first.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  await runOnce(page, 'R-1');
  await goTo(page, 'Results');
  await expect(page.getByRole('row', { name: /^R-1 / })).toBeVisible();

  await goTo(page, 'Library');
  await page.getByRole('button', { name: 'Open template Hover track hold' }).click();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await goTo(page, 'Results');
  await expect(page.getByRole('heading', { level: 1, name: 'Results' })).toBeVisible();
  await expect(page.getByRole('row', { name: /^R-\d+ / })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Scorecard' })).toHaveCount(0);
});
