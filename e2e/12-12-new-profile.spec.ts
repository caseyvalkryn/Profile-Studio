import { expect, test, type Page } from '@playwright/test';
import { goTo, isMac } from './helpers';

const nameField = (page: Page) => page.getByRole('textbox', { name: 'Profile name' });

async function renameAndList(page: Page, name: string): Promise<void> {
  await nameField(page).fill(name);
  await nameField(page).press('Enter');
  await goTo(page, 'Library');
  await expect(page.getByTestId('saved-card').filter({ hasText: name })).toBeVisible();
}

// Review 9.1 F-01 and F-02: New lands on Build with the name field focused, and the route request
// is taken once, so the workspace links work after it.
test('12.12 New opens Build with "Untitled profile" focused; a rename is listed in the Library.', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New profile' }).click();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(nameField(page)).toHaveValue('Untitled profile');
  await expect(nameField(page)).toBeFocused();
  await expect(page.getByRole('banner')).toContainText('PROF-1');
  await renameAndList(page, 'Range day one');

  // Cmd+N (Ctrl+N) from Build does the same.
  await goTo(page, 'Build');
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press(`${(await isMac(page)) ? 'Meta' : 'Control'}+n`);
  await expect(nameField(page)).toHaveValue('Untitled profile');
  await expect(nameField(page)).toBeFocused();
  await expect(page.getByRole('banner')).toContainText('PROF-2');
  await renameAndList(page, 'Range day two');
  await expect(page.getByTestId('saved-card').filter({ hasText: 'Range day one' })).toBeVisible();
});
