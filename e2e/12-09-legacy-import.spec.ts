import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { assetCentres } from './helpers';

const FIXTURE = resolve(__dirname, '../src/features/library/__fixtures__/legacy-v4-cuas-001.json');

type Pt = { x: number; y: number; z: number; hold: number };
type Legacy = {
  name: string;
  purpose: string;
  scene: {
    systems: { id: string }[];
    volumes: { id: string; label: string }[];
    planes: { label: string }[];
    paths: { id: string; pts: Pt[] }[];
  };
  events: { label: string }[];
  mop: string[];
  data: string[];
  cards: { name: string; caption: string; notes: string }[];
  telemetry: { tspi: string };
};

test('12.9 A legacy v4 JSON from the current app imports without loss of assets, paths or text.', async ({
  page,
}) => {
  const legacy = JSON.parse(await readFile(FIXTURE, 'utf8')) as Legacy;

  await page.goto('/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    // On the Library route the top bar leaves Import to the Library (review 9.1 F-20).
    page.getByRole('button', { name: 'Import', exact: true }).last().click(),
  ]);
  await chooser.setFiles(FIXTURE);
  await expect(page.getByText('Imported 1 profile')).toBeVisible();

  const card = page.getByTestId('saved-card').filter({ hasText: legacy.name });
  await card.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Build' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Profile name' })).toHaveValue(legacy.name);
  await expect(page.getByRole('main', { name: 'Build' })).toContainText(legacy.purpose);

  // Assets: every legacy system is on the map under its id; the volume and the threat too.
  await expect
    .poll(async () => [...(await assetCentres(page)).keys()].sort())
    .toEqual(legacy.scene.systems.map((s) => s.id).sort());
  for (const id of [
    ...legacy.scene.volumes.map((v) => v.id),
    ...legacy.scene.paths.map((p) => p.id),
  ])
    await expect(
      page.locator(`[data-testid="board-stage"] svg.board [data-id="${id}"]`).first(),
    ).toBeAttached();

  // The saved vignette, downloaded from the Export dialog, keeps every path point and every text.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Export / });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  const text = await readFile((await file.path())!, 'utf8');
  const out = JSON.parse(text) as {
    vignette?: {
      threats: { id: string; path: { x: number; y: number; z: number; holdS: number }[] }[];
    };
    threats?: { id: string; path: { x: number; y: number; z: number; holdS: number }[] }[];
  };
  const threats = out.vignette?.threats ?? out.threats ?? [];
  for (const p of legacy.scene.paths) {
    const t = threats.find((x) => x.id === p.id);
    expect(t, `threat ${p.id}`).toBeDefined();
    expect(t!.path.map((w) => [w.x, w.y, w.z, w.holdS])).toEqual(
      p.pts.map((w) => [w.x, w.y, w.z, w.hold]),
    );
  }
  const strings = [
    legacy.name,
    legacy.purpose,
    ...legacy.events.map((e) => e.label),
    ...legacy.mop,
    ...legacy.data,
    ...legacy.cards.flatMap((c) => [c.name, c.caption, c.notes]),
    ...legacy.scene.volumes.map((v) => v.label),
    ...legacy.scene.planes.map((p) => p.label),
    legacy.telemetry.tspi,
  ].filter(Boolean);
  for (const s of strings)
    expect(text, `text kept: ${s}`).toContain(JSON.stringify(s).slice(1, -1));
});
