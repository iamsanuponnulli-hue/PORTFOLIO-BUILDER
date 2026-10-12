/**
 * Loads rendered sites in Chromium and checks every layout × preset at phone,
 * tablet and desktop widths, in light and dark mode:
 *  - no sideways scrolling,
 *  - no serious or critical accessibility problems (axe-core),
 *  - no script errors.
 * Run: pnpm --filter @pb/renderer test:browser
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { previewDocument, render } from '../src/render.ts';
import type { ProfileType } from '@pb/schema';
import { sampleState } from '../src/samples.ts';
import { ASSETS, kitchenSink, PRESET_IDS } from './fixtures.ts';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const WIDTHS = [390, 768, 1440];
const now = new Date('2026-10-12T00:00:00Z');

type Case = { name: string; html: string };
const cases: Case[] = [];

for (const preset of PRESET_IDS) {
  for (let v = 0; v < 4; v++) {
    const state = kitchenSink(v, preset, v % 2 === 0);
    const { files } = render(state, { mode: 'export', fontSource: 'system', assets: ASSETS, now });
    cases.push({ name: `${preset}/layouts-${v}`, html: previewDocument(files) });
    if (v === 0) {
      const page = Object.keys(files).find((f) => f.startsWith('projects/'))!;
      cases.push({ name: `${preset}/case-study`, html: previewDocument(files, page) });
    }
  }
}
for (const t of ['developer', 'designer', 'student', 'professional'] as ProfileType[]) {
  const { files } = render(sampleState(t), { mode: 'export', fontSource: 'system', now });
  cases.push({ name: `default/${t}`, html: previewDocument(files) });
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const failures: string[] = [];
let checked = 0;

for (const scheme of ['light', 'dark'] as const) {
  const context = await browser.newContext({ colorScheme: scheme, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const c of cases) {
    for (const width of WIDTHS) {
      errors = [];
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(c.html, { waitUntil: 'load' });
      const label = `${c.name} @${width}px ${scheme}`;
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 1) failures.push(`${label}: page scrolls sideways by ${overflow}px`);
      if (width !== 768) {
        await page.addScriptTag({ content: AXE });
        const violations = await page.evaluate(async () => {
          // @ts-expect-error axe is injected above
          const r = await window.axe.run(document, { resultTypes: ['violations'] });
          return r.violations
            .filter((v: { impact: string }) => v.impact === 'serious' || v.impact === 'critical')
            .map(
              (v: { id: string; nodes: { target: string[] }[] }) =>
                `${v.id} (${v.nodes
                  .slice(0, 3)
                  .map((n) => n.target.join(' '))
                  .join(', ')})`,
            );
        });
        for (const v of violations) failures.push(`${label}: ${v}`);
      }
      for (const e of errors) failures.push(`${label}: script error ${e}`);
      checked++;
    }
  }
  await context.close();
}
await browser.close();

console.log(
  `Checked ${checked} page loads (${cases.length} pages × ${WIDTHS.length} widths × 2 colour schemes).`,
);
if (failures.length) {
  console.error(`${failures.length} problems:\n` + [...new Set(failures)].slice(0, 80).join('\n'));
  process.exit(1);
}
console.log('No layout, accessibility or script problems found.');
