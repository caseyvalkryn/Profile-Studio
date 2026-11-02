import { expect, test } from '@playwright/test';
import { openTemplate, POINT_DEFENCE } from './helpers';

test('12.28 H draws the rest of the board faint, the chip names the focus, Shift+H hides the rest, H again draws everything strong; Shift+5 twice leaves only the focus labels.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const view = page.getByTestId('board-view');
  const svg = page.locator('[data-testid="board-stage"] svg.board');
  const labelsAll = await svg.locator('text').count();
  expect(labelsAll).toBeGreaterThan(2);

  // select the threat from the rail, then H
  await page.getByRole('navigation', { name: 'Scene' }).locator('button[data-key]').first().click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('h');
  await expect(view).toHaveClass(/focus-faint/);
  await expect(page.getByTestId('focus-chip')).toContainText('T1');
  await expect(svg.locator('.dim').first()).toBeAttached();

  // Shift+H hides the rest: a dimmed element is no longer visible
  await page.keyboard.press('Shift+h');
  await expect(view).toHaveClass(/focus-hidden/);
  await expect(svg.locator('.dim').first()).toBeHidden();

  // Shift+5 twice: all, focus, off would be three; two presses leave the focus's labels
  await page.keyboard.press('Shift+5');
  await expect(page.getByRole('checkbox', { name: 'Labels · focus' })).toBeAttached();
  const labelsFocus = await svg.locator('text:visible').count();
  expect(labelsFocus).toBeLessThan(labelsAll);
  expect(labelsFocus).toBeGreaterThan(0);

  // H on the focused selection draws everything strong again
  await page.keyboard.press('h');
  await expect(view).not.toHaveClass(/focus-/);
  await expect(page.getByTestId('focus-chip')).toHaveCount(0);
  await expect(svg.locator('.dim')).toHaveCount(0);
});
