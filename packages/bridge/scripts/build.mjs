/**
 * Builds the browser bundles into app/web/js/:
 *  - pb.js: small page bundle (window.pb), loaded with the app
 *  - worker/: the background worker as ES modules with code splitting, so the
 *    PDF and Word readers load only when a resume is imported
 *  - pdf.worker.min.mjs: pdf.js's own worker
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../app/web/js');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'es2022',
  logLevel: 'info',
  legalComments: 'none',
};

await build({
  ...common,
  entryPoints: [resolve(here, '../src/main.ts')],
  format: 'iife',
  outfile: resolve(out, 'pb.js'),
});
await build({
  ...common,
  entryPoints: { worker: resolve(here, '../src/worker.ts') },
  format: 'esm',
  splitting: true,
  outdir: resolve(out, 'worker'),
  chunkNames: 'chunks/[name]-[hash]',
});

const require = createRequire(resolve(here, '../../imports/package.json'));
copyFileSync(
  require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),
  resolve(out, 'pdf.worker.min.mjs'),
);
