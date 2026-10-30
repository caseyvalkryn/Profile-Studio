import { expect, test } from '@playwright/test';
import { goTo, openTemplate } from './helpers';

test('12.7 A one-factor sweep shows a line chart of the measure against the factor.', async ({
  page,
}) => {
  await openTemplate(page, 'Detection range sweep');
  await page
    .getByRole('main', { name: 'Build' })
    .getByRole('button', { name: 'Run sweep' })
    .click();
  await goTo(page, 'Results');

  const section = page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'Sweep' }),
  });
  await expect(section).toBeVisible();
  const chart = section.locator('svg.recharts-surface');
  await expect(chart.locator('.recharts-line-curve')).toHaveAttribute('d', /^M[\d.]+,[\d.]+L/, {
    timeout: 30_000,
  });
  // One dot per factor level, and the x axis names the factor.
  const ticks = chart.locator('.recharts-xAxis .recharts-cartesian-axis-tick');
  const dots = chart.locator('.recharts-line-dots circle');
  await expect(dots).toHaveCount(await ticks.count());
  expect(await dots.count()).toBeGreaterThanOrEqual(3);
  await expect(chart.locator('.recharts-xAxis .recharts-label')).toHaveText(/altitude/i);
  await expect(section).toContainText('1.1.2');
});
