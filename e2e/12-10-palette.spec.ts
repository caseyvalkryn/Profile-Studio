import { expect, test } from '@playwright/test';
import { isMac, openTemplate, POINT_DEFENCE } from './helpers';

type Cmd = { id: string; label: string; shortcut?: string };
type Registry = { all: () => Cmd[]; shortcutLabel: (c: Cmd, mac?: boolean) => string };

/** The live command registry, loaded in Node through Vite's SSR loader (it handles import.meta). */
async function loadRegistry(): Promise<Cmd[] & { label: (c: Cmd, mac: boolean) => string }> {
  const { createServer } = await import('vite');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const commands = (await server.ssrLoadModule('/src/commands/commands.ts')) as {
      registerCommands: () => void;
    };
    const reg = (await server.ssrLoadModule('/src/commands/registry.ts')) as unknown as Registry;
    commands.registerCommands();
    const list = reg.all().map((c) => ({ id: c.id, label: c.label, shortcut: c.shortcut }));
    return Object.assign(list, { label: (c: Cmd, mac: boolean) => reg.shortcutLabel(c, mac) });
  } finally {
    await server.close();
  }
}

test('12.10 Every command is reachable from the palette, and its shortcut matches the shortcut sheet.', async ({
  page,
}) => {
  const registry = await loadRegistry();
  expect(registry.length).toBeGreaterThan(40);
  await openTemplate(page, POINT_DEFENCE);
  const mac = await isMac(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });

  // Palette: one entry per command. The palette command itself is the Cmd+K that opens it.
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  const entries = await palette.getByRole('option').evaluateAll((els) =>
    els.map((el) => ({
      label: el.querySelector('span')?.textContent ?? '',
      shortcut: el.querySelector('kbd')?.textContent ?? '',
    })),
  );
  const inPalette = registry.filter((c) => c.id !== 'help.palette');
  expect(entries.map((e) => e.label).sort()).toEqual(inPalette.map((c) => c.label).sort());
  for (const c of inPalette) {
    const e = entries.find((x) => x.label === c.label)!;
    expect(e.shortcut, `palette shortcut for ${c.id}`).toBe(registry.label(c, mac));
  }
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // Shortcut sheet: every command with a key, with the same label and shortcut.
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  const rows = await sheet.getByRole('listitem').evaluateAll((els) =>
    els.map((el) => ({
      label: el.querySelector('span')?.textContent ?? '',
      shortcut: el.querySelector('kbd')?.textContent ?? '',
    })),
  );
  const keyed = registry.filter((c) => c.shortcut);
  expect(rows.map((r) => `${r.label} ${r.shortcut}`).sort()).toEqual(
    keyed.map((c) => `${c.label} ${registry.label(c, mac)}`).sort(),
  );
  // And each keyed command shows the same shortcut in both places.
  for (const r of rows) {
    const e = entries.find((x) => x.label === r.label);
    if (e) expect(e.shortcut, `palette vs sheet for ${r.label}`).toBe(r.shortcut);
  }
});
