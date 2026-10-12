/**
 * Writes every sample person × theme preset as a complete static site, plus an
 * index page linking to them all. Open .gallery/index.html in a browser.
 *   pnpm --filter @pb/renderer gallery [--fonts=google|system]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProfileType } from '@pb/schema';
import { PRESETS } from '../src/defaults.ts';
import { render } from '../src/render.ts';
import { sampleState } from '../src/samples.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../.gallery');
const fontArg = process.argv.find((a) => a.startsWith('--fonts='))?.split('=')[1];
const fontSource = fontArg === 'system' ? 'system' : 'google';

rmSync(out, { recursive: true, force: true });
const types: ProfileType[] = ['developer', 'designer', 'student', 'professional'];
const rows: string[] = [];
for (const t of types) {
  const links: string[] = [];
  for (const preset of [undefined, ...PRESETS.map((p) => p.id)]) {
    const name = `${t}-${preset ?? 'default'}`;
    const { files, checks } = render(sampleState(t, preset), { mode: 'export', fontSource });
    for (const [path, body] of Object.entries(files)) {
      const file = resolve(out, name, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
    const problems = checks.filter((c) => c.severity !== 'info').length;
    links.push(
      `<li><a href="${name}/index.html">${preset ?? 'default'}</a>${problems ? ` (${problems} checks)` : ''}</li>`,
    );
  }
  rows.push(`<section><h2>${t}</h2><ul>${links.join('')}</ul></section>`);
}
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Renderer gallery</title><style>body{font:16px system-ui;margin:2rem;max-width:60rem}ul{display:flex;flex-wrap:wrap;gap:1rem;list-style:none;padding:0}</style><h1>Renderer gallery</h1>${rows.join('')}`,
);
console.log(`Wrote ${types.length * (PRESETS.length + 1)} sites to ${out}`);
