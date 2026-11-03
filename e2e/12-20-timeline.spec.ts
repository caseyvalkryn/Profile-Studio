import { expect, test, type Page } from '@playwright/test';
import { goTo, openTemplate, POINT_DEFENCE } from './helpers';

/** "t+1:40" from seconds, as the strip clock writes it (src/features/shared/units.ts fmtTime). */
const clockOf = (s: number) => {
  const w = Math.max(0, Math.round(s));
  return `t+${Math.floor(w / 60)}:${String(w % 60).padStart(2, '0')}`;
};

/** The card count of each stored profile (the autosave writes cards as any other edit). */
const storedCards = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[]>((res, rej) => {
        const r = indexedDB.open('profile-studio');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('vignettes')) return res([]);
          const q = db.transaction('vignettes').objectStore('vignettes').getAll();
          // The test's own profile only: the shipped profiles are stored too.
          q.onsuccess = () =>
            res(
              (q.result as { name: string; cards?: unknown[] }[])
                .filter((v) => v.name === 'Clock check')
                .map((v) => v.cards?.length ?? 0),
            );
          q.onerror = () => rej(q.error);
        };
      }),
  );

/** The names in the app's IndexedDB store (src/state/persist.ts: 'profile-studio', 'vignettes'). */
const storedNames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((res, rej) => {
        const r = indexedDB.open('profile-studio');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('vignettes')) return res([]);
          const q = db.transaction('vignettes').objectStore('vignettes').getAll();
          q.onsuccess = () => res((q.result as { name: string }[]).map((v) => v.name));
          q.onerror = () => rej(q.error);
        };
      }),
  );

test('Phase 13: the strip is the plan clock: its rows and glyphs select and set the time; the time survives a reload.', async ({
  page,
}) => {
  await openTemplate(page, POINT_DEFENCE);
  const clock = page.getByRole('textbox', { name: 'Time', exact: true });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const board = page.locator('[data-testid="board-stage"] svg.board');

  // A template copy is stored on its first edit (FR-07), so the reload below can reopen it.
  const name = page.getByRole('textbox', { name: 'Profile name' });
  await name.fill('Clock check');
  await name.press('Enter');

  // Time on: type 1:40 in the strip clock.
  await clock.fill('1:40');
  await clock.press('Enter');
  await expect(clock).toHaveValue('t+1:40');

  // A system row's label selects that system: the inspector row and the board.
  const row = page.getByTestId('tl-row').first();
  const label = row.locator('text.tl-rowlab');
  const id = (await label.textContent())!.trim();
  expect(id).toMatch(/^[A-Z0-9]+-\d+$/);
  await label.click();
  await expect(row).toHaveClass(/tl-lit/);
  const item = inspector.getByRole('button', { name: `Select ${id}`, exact: true });
  await expect(item.locator('..')).toHaveAttribute('aria-current', 'true');
  await expect(board.locator(`.sel[data-id="${id}"]`).first()).toBeAttached();
  // A row press selects; it does not move the time.
  await expect(clock).toHaveValue('t+1:40');

  // A key point glyph sets the time to its point.
  const stage = page.getByTestId('tl-stage').first();
  const t = Number(await stage.getAttribute('data-time'));
  expect(Number.isFinite(t)).toBe(true);
  await stage.locator('circle.tl-hit').click();
  await expect(clock).toHaveValue(clockOf(t));

  // Reload: the time state is kept per profile (localStorage, 250 ms debounce); the selection is not.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('profileStudio.time') ?? ''))
    .toContain(`"tS":${Math.round(t * 10) / 10}`);
  // Autosave writes the renamed copy 500 ms after the edit; wait for it so the reload reopens it.
  await expect.poll(() => storedNames(page)).toContain('Clock check');
  await page.reload();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(clock).toHaveValue(clockOf(t));
  await expect(inspector.locator('[aria-current="true"]')).toHaveCount(0);
  await expect(board.locator('.sel')).toHaveCount(0);

  // Brief: two frame cards, at the Build time and at 0:30. A Cards row marker opens its card.
  await goTo(page, 'Brief');
  const head = page.getByTestId('brief-head');
  await expect(head).toHaveText(/^Build view · /);
  const save = page.getByRole('button', { name: 'Save a frame as a card' });
  await save.click();
  await expect(head).toHaveText(/^1 of 1 · /);
  await clock.fill('0:30');
  await clock.press('Enter');
  await save.click();
  await expect(head).toHaveText(/^2 of 2 · /);
  const marks = page.getByTestId('tl-card');
  await expect(marks).toHaveCount(2);
  await marks.nth(0).locator('rect.tl-card-mark').click();
  await expect(head).toHaveText(/^1 of 2 · /);
  await expect(clock).toHaveValue(clockOf(t));
  await marks.nth(1).locator('rect.tl-card-mark').click();
  await expect(head).toHaveText(/^2 of 2 · /);
  await expect(clock).toHaveValue('t+0:30');

  // Reload in Brief: the same card opens at its time; leaving Brief restores the Build time.
  await expect.poll(() => storedCards(page)).toEqual([2]);
  await page.reload();
  await expect(page.getByRole('main', { name: 'Brief' })).toBeVisible();
  await expect(head).toHaveText(/^2 of 2 · /);
  await expect(clock).toHaveValue('t+0:30');
  await goTo(page, 'Build');
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(clock).toHaveValue(clockOf(t));
});
