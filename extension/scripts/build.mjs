/**
 * Builds the extension into extension/dist (load it with "Load unpacked") and a
 * zip for the Edge Add-ons store in extension/portfolio-builder-extension.zip.
 *
 * The app's addresses (where the relay script runs) come from PB_APP_ORIGINS,
 * comma-separated, e.g. PB_APP_ORIGINS=https://my-project.web.app,https://my.domain
 */
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { zipSync } from 'fflate';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const origins = (
  process.env.PB_APP_ORIGINS ??
  'http://localhost,http://127.0.0.1,https://demo-portfolio-builder.web.app,https://demo-portfolio-builder.firebaseapp.com'
)
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const matches = origins.map((o) => `${o.replace(/:\d+$/, '')}/*`);

await build({
  entryPoints: ['background', 'relay', 'popup', 'permission'].map((n) =>
    resolve(root, `src/${n}.ts`),
  ),
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});
for (const f of readdirSync(resolve(root, 'static')))
  copyFileSync(resolve(root, 'static', f), resolve(out, f));

// Icons: a rounded teal square with a white "P" mark, drawn pixel by pixel.
function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = dx * dx + dy * dy <= r * r;
      const u = x / size,
        v = y / size;
      const stem = u > 0.3 && u < 0.43 && v > 0.22 && v < 0.8;
      const ring =
        Math.hypot(u - 0.5, v - 0.4) < 0.2 && Math.hypot(u - 0.5, v - 0.4) > 0.08 && u > 0.36;
      const white = stem || ring;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      if (!inside) continue;
      raw[i] = white ? 255 : 15;
      raw[i + 1] = white ? 255 : 110;
      raw[i + 2] = white ? 255 : 116;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const icons = {};
for (const s of [16, 32, 48, 128]) {
  writeFileSync(resolve(out, `icon-${s}.png`), icon(s));
  icons[s] = `icon-${s}.png`;
}

const manifest = {
  manifest_version: 3,
  name: 'Portfolio Builder Companion',
  short_name: 'Portfolio Builder',
  version: '0.1.0',
  description:
    'Lets Portfolio Builder borrow the look of sites you like, read your blog feed and check your links. Runs on your computer only.',
  icons,
  action: {
    default_popup: 'popup.html',
    default_title: 'Send this page to Portfolio Builder',
    default_icon: icons,
  },
  background: { service_worker: 'background.js' },
  permissions: ['activeTab', 'scripting', 'storage'],
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  content_scripts: [{ matches, js: ['relay.js'], run_at: 'document_start' }],
  minimum_chrome_version: '110',
};
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const files = {};
for (const f of readdirSync(out)) files[f] = new Uint8Array(readFileSync(resolve(out, f)));
writeFileSync(resolve(root, 'portfolio-builder-extension.zip'), zipSync(files, { level: 9 }));
process.stdout.write(`extension built for ${origins.join(', ')}\n`);
