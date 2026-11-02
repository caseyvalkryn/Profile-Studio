import { expect, test } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE } from './helpers';

const secs = (clock: string) => {
  const m = /^t\+(\d+):(\d\d)$/.exec(clock.trim());
  if (!m) throw new Error(`not a clock: ${clock}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

test('Phase 13: in Brief a Shift-drag loop becomes a slice card; P plays inside the slice.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  await goTo(page, 'Brief');
  await expect(page.getByRole('main', { name: 'Brief' })).toBeVisible();
  const head = page.getByTestId('brief-head');
  await expect(head).toHaveText(/^Build view · /);

  // Shift and drag on the strip's axis from 20 % to 60 % of its width: the loop.
  const axis = page.locator('[data-testid="timeline"] svg.tl-axis');
  const box = (await axis.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByRole('button', { name: 'Loop range' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // No card yet: the Scissors button adds a card with the loop as its slice.
  await page.getByRole('button', { name: 'Set the slice from the loop' }).click();
  await expect(head).toHaveText(/^1 of 1 · /);
  const sliceHead = page.getByTestId('brief-slice-head');
  await expect(sliceHead).toHaveText(/^t\+\d+:\d\d to t\+\d+:\d\d · x1$/);
  const m = /(t\+\d+:\d\d) to (t\+\d+:\d\d)/.exec((await sliceHead.textContent()) ?? '');
  expect(m).not.toBeNull();
  const [t0, t1] = [secs(m![1]!), secs(m![2]!)];
  expect(t1 - t0).toBeGreaterThan(5);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  await expect(page.getByTestId('brief-slice-from')).toHaveValue(mmss(t0));
  await expect(page.getByTestId('brief-slice-to')).toHaveValue(mmss(t1));
  await expect(page.getByTestId('brief-slice-rate')).toHaveValue('1');

  // The slice starts on a whole second, so the first clock sample reads its start exactly.
  const from = page.getByTestId('brief-slice-from');
  await from.fill(mmss(t0));
  await from.press('Enter');
  await expect(sliceHead).toHaveText(new RegExp(`^t\\+${mmss(t0)} to `));

  // P from a time outside the slice starts at the slice's start, then plays inside it.
  const clock = page.getByRole('textbox', { name: 'Time', exact: true });
  await clock.fill('0:05');
  await clock.press('Enter');
  await expect(clock).toHaveValue('t+0:05');
  expect(t0).toBeGreaterThan(5);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('p');
  await expect.poll(() => clock.inputValue(), { intervals: [20] }).not.toBe('t+0:05');
  const start = secs(await clock.inputValue());
  expect(start).toBe(t0);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.waitForTimeout(1500);
  const later = secs(await clock.inputValue());
  expect(later).toBeGreaterThan(start);
  expect(later).toBeGreaterThanOrEqual(t0);
  expect(later).toBeLessThanOrEqual(t1);
});
