import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { goTo } from './helpers';

const FIXTURE = resolve(__dirname, '../src/features/library/__fixtures__/legacy-v4-cuas-001.json');

type Legacy = { id: string; name: string; cards: { name: string; caption: string }[] };

test('12.19 Brief opens the imported deck at card 1; Right and Left move between cards at their view and time.', async ({
  page,
}) => {
  const legacy = JSON.parse(await readFile(FIXTURE, 'utf8')) as Legacy;
  expect(legacy.cards).toHaveLength(3);

  // Import the legacy v4 record as 12-09 does, then open it.
  await page.goto('/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import', exact: true }).last().click(),
  ]);
  await chooser.setFiles(FIXTURE);
  await expect(page.getByText('Imported 1 profile')).toBeVisible();
  await page
    .getByTestId('saved-card')
    .filter({ hasText: legacy.name })
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();

  await goTo(page, 'Brief');
  const brief = page.getByRole('main', { name: 'Brief' });
  await expect(brief).toBeVisible();
  const head = page.getByTestId('brief-head');
  const stage = page.getByTestId('brief-stage').locator('svg.board');
  await expect(head).toHaveText(`1 of 3 · ${legacy.id}`);
  await expect(brief.getByRole('heading', { name: legacy.cards[0]!.name })).toBeVisible();
  await expect(stage).toHaveAttribute('data-proj', 'plan');
  await expect(
    page.getByRole('complementary', { name: 'Cards' }).getByRole('button', { name: /^Card \d/ }),
  ).toHaveCount(3);

  // Right: card 2, "The loiter", 3D at t+200 s; its time is on the Build stores too.
  await page.keyboard.press('ArrowRight');
  await expect(head).toHaveText(`2 of 3 · ${legacy.id}`);
  await expect(brief.getByRole('heading', { name: legacy.cards[1]!.name })).toBeVisible();
  await expect(stage).toHaveAttribute('data-proj', 'axon');
  await expect(page.getByRole('spinbutton', { name: 'Time s' })).toHaveValue('200');
  await expect(page.getByRole('region', { name: 'Stage' })).toContainText(legacy.cards[1]!.caption);

  // Left: back to card 1.
  await page.keyboard.press('ArrowLeft');
  await expect(head).toHaveText(`1 of 3 · ${legacy.id}`);
  await expect(stage).toHaveAttribute('data-proj', 'plan');

  // Print: one page per card.
  await expect(page.getByTestId('brief-page')).toHaveCount(3);
});
