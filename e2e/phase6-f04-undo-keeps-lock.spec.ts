import { expect, test } from '@playwright/test';
import { goTo, num, openTemplate, POINT_DEFENCE, runOnce, setPrediction } from './helpers';

test('F-04 Set a prediction, run, then undo: the prediction stays as locked.', async ({ page }) => {
  await openTemplate(page, POINT_DEFENCE);
  await setPrediction(page, '1.90', '2.40');
  await runOnce(page, 'R-1');

  await page.locator('body').click({ position: { x: 5, y: 5 } }); // no text field has focus
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const h1 = inspector.getByRole('button', { name: /^H-01/ });
  if ((await h1.getAttribute('aria-pressed')) !== 'true') await h1.click();
  expect(await num(inspector.getByRole('textbox', { name: 'Prediction low' }))).toBeCloseTo(1.9, 2);
  expect(await num(inspector.getByRole('textbox', { name: 'Prediction high' }))).toBeCloseTo(
    2.4,
    2,
  );

  await goTo(page, 'Results');
  const row = page.getByRole('list', { name: 'Hypotheses' }).getByRole('listitem').first();
  await expect(row).toContainText('Prediction [1.90, 2.40]');
  await expect(row).toContainText(/Locked \d{4}-\d{2}-\d{2}/);
});
