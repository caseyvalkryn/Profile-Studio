import { expect, test } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE, runOnce, setPrediction } from './helpers';

test('12.5 A hypothesis with a prediction locks at the first run. The Results row shows Meets, Does not meet or Inconclusive.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  await setPrediction(page, '1.90', '2.40');
  await runOnce(page, 'R-1');

  // The prediction fields lock after the first run.
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('textbox', { name: 'Prediction low' })).not.toBeEditable();

  await goTo(page, 'Results');
  const row = page.getByRole('list', { name: 'Hypotheses' }).getByRole('listitem').first();
  await expect(row).toContainText('H-01');
  await expect(row).toContainText('Prediction [1.90, 2.40]');
  await expect(row).toContainText(/Locked \d{4}-\d{2}-\d{2}/);
  await expect(row).toContainText(/(Meets|Does not meet|Inconclusive)$/);
});
