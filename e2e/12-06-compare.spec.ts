import { expect, test } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE, runOnce } from './helpers';

test('12.6 Two runs compare side by side with the difference shown.', async ({ page }) => {
  await openTemplate(page, POINT_DEFENCE);
  await runOnce(page, 'R-1');
  await runOnce(page, 'R-2');
  await goTo(page, 'Results');
  await page.getByRole('checkbox', { name: 'Compare R-1' }).check();
  await page.getByRole('checkbox', { name: 'Compare R-2' }).check();

  const table = page.getByRole('table', { name: 'Run compare' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Measure',
    'R-1',
    'R-2',
    'Difference against R-1',
  ]);
  const row = table.getByRole('row', { name: /^1\.1\.2 / });
  const cells = row.getByRole('cell');
  await expect(cells.nth(1)).toHaveText(/^\d[\d.,]* nm \[/);
  await expect(cells.nth(2)).toHaveText(/^\d[\d.,]* nm \[/);
  await expect(cells.nth(3)).toHaveText(/^[+−±]\d[\d.,]* nm, intervals (overlap|do not overlap)/);
});
