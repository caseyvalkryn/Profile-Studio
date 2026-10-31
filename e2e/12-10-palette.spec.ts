import { expect, test } from '@playwright/test';
import { isMac, openTemplate, POINT_DEFENCE } from './helpers';

type Cmd = { id: string; label: string; shortcut?: string };
type Registry = {
  inWorkspace: (w: 'build') => Cmd[];
  shortcutLabel: (c: Cmd, mac?: boolean) => string;
};
type Row = { keys: string; label: string; ids: string[] };
type Sheet = { sheetRows: (w: 'build', mac?: boolean) => Row[] };

/**
 * The live command registry, filtered to the Build workspace, and the Build sheet rows, loaded in
 * Node through Vite's SSR loader (it handles import.meta).
 */
async function loadRegistry(): Promise<
  Cmd[] & { label: (c: Cmd, mac: boolean) => string; rows: (mac: boolean) => Row[] }
> {
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
    const sheet = (await server.ssrLoadModule(
      '/src/features/commands/sheet.ts',
    )) as unknown as Sheet;
    commands.registerCommands();
    const list = reg
      .inWorkspace('build')
      .map((c) => ({ id: c.id, label: c.label, shortcut: c.shortcut }));
    const rows = { mac: sheet.sheetRows('build', true), other: sheet.sheetRows('build', false) };
    return Object.assign(list, {
      label: (c: Cmd, mac: boolean) => reg.shortcutLabel(c, mac),
      rows: (mac: boolean) => (mac ? rows.mac : rows.other),
    });
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

  // Shortcut sheet: every command with a key in Build, in the generated rows, with the same
  // shortcut as the palette. Legacy rows join related commands ("Step 1 s": Left, Right).
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keys in Build' });
  await expect(sheet).toBeVisible();
  const rows = await sheet.getByRole('row').evaluateAll((els) =>
    els.map((el) => ({
      shortcut: el.querySelector('.hp-k')?.textContent ?? '',
      label: el.querySelector('.hp-l')?.textContent ?? '',
    })),
  );
  const expected = registry.rows(mac);
  expect(rows).toEqual(expected.map((r) => ({ shortcut: r.keys, label: r.label })));
  const keyed = registry.filter((c) => c.shortcut);
  expect(expected.flatMap((r) => r.ids).sort()).toEqual(keyed.map((c) => c.id).sort());
  // And each one-command row shows the same shortcut in both places.
  for (const r of expected.filter((x) => x.ids.length === 1 && x.ids[0] !== 'help.palette')) {
    const c = registry.find((x) => x.id === r.ids[0])!;
    const e = entries.find((x) => x.label === c.label)!;
    expect(e.shortcut, `palette vs sheet for ${c.id}`).toBe(r.keys);
  }
});
