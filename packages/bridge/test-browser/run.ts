/**
 * Runs the built browser bundles (app/web/js) in Chromium against a local mock AI
 * provider (OpenAI-compatible) and checks the real code paths: page → worker →
 * provider, IndexedDB keys, PDF reading with pdf.js's nested worker, image
 * processing with OffscreenCanvas. Build first: pnpm bridge
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../../../app/web');
const fixtures = resolve(import.meta.dirname, '../../imports/test/fixtures');
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
  '.map': 'application/json',
};

const resumeReply = JSON.stringify({
  name: 'Jane Doe',
  headline: 'Senior Software Engineer',
  experience: [
    {
      company: 'Brightcart',
      role: 'Senior Software Engineer',
      start: '2022',
      end: 'Present',
      bullets: ['Led the checkout rewrite that cut page load time from 4.1s to 1.3s.'],
    },
  ],
  skills: [{ group: 'Skills', items: ['TypeScript', 'Go', 'SQL'] }],
});
const seen: string[] = [];

const server = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST',
  };
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  const url = new URL(req.url!, 'http://x');
  if (url.pathname.startsWith('/mock/v1/')) {
    seen.push(`${req.method} ${url.pathname} ${req.headers.authorization}`);
    if (req.headers.authorization !== 'Bearer good-key')
      return void res.writeHead(401, cors).end('{}');
    if (url.pathname.endsWith('/models')) {
      return void res
        .writeHead(200, { ...cors, 'content-type': 'application/json' })
        .end(JSON.stringify({ data: [{ id: 'mock-large' }, { id: 'mock-mini' }] }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push(`prompt-has-resume:${body.includes('cut page load time')}`);
      res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 0,
          model: 'mock-large',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: resumeReply },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      );
    });
    return;
  }
  if (url.pathname === '/') {
    return void res
      .writeHead(200, { 'content-type': 'text/html' })
      .end('<!doctype html><title>t</title><script src="/js/pb.js"></script>');
  }
  try {
    const file = readFileSync(resolve(root, '.' + url.pathname));
    res
      .writeHead(200, {
        'content-type': TYPES[extname(url.pathname)] ?? 'application/octet-stream',
      })
      .end(file);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/');
await page.waitForFunction(() => 'pb' in window);

const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test assertions read arbitrary result shapes
type R = { ok: boolean; value?: any; error?: { code: string; message: string } };
const pb = async (expr: string): Promise<R> =>
  JSON.parse(await page.evaluate(`(async () => ${expr})()`));

// Keys: a rejected key is not saved; a good key is checked, saved, and encrypted.
const bad = await pb(`pb.keys.add('custom', 'bad-key', '${base}/mock/v1', 'Mock')`);
check('rejected key is reported and not saved', !bad.ok && bad.error?.code === 'invalid_key', bad);
const good = await pb(`pb.keys.add('custom', 'good-key', '${base}/mock/v1', 'Mock')`);
check(
  'good key is checked and saved',
  good.ok && good.value.key.last4 === '-key' && good.value.models.length === 2,
  good,
);
check(
  'a capable model is suggested',
  good.value?.suggested === 'mock-large',
  good.value?.suggested,
);
const listed = await pb(`pb.keys.list()`);
check(
  'key list shows only the last 4 characters',
  listed.ok && !JSON.stringify(listed.value).includes('good-key'),
  listed,
);

// Resume: pick a PDF through the real file chooser; pdf.js reads it in its own worker.
const chooser = page.waitForEvent('filechooser');
const pick = page.evaluate(`pb.imports.pickResume('p1')`) as Promise<string>;
await (await chooser).setFiles(resolve(fixtures, 'resume.pdf'));
const resume: R = JSON.parse(await pick);
check(
  'PDF text is read in the browser',
  resume.ok && resume.value.text.includes('cut page load time') && resume.value.pages === 2,
  resume,
);

// AI: the worker calls the provider with the stored key and validates the answer.
const parsed = await pb(
  `pb.ai.parseResume('custom', 'mock-large', ${JSON.stringify(resume.value?.text ?? '')})`,
);
check(
  'resume is turned into portfolio content',
  parsed.ok &&
    parsed.value.content.profile.name === 'Jane Doe' &&
    parsed.value.content.experience[0].id === 'e1',
  parsed,
);
check(
  'the provider received the resume text with the key',
  seen.includes('prompt-has-resume:true') &&
    seen.some((s) => s.includes('chat/completions Bearer good-key')),
  seen,
);
const noKey = await pb(`pb.ai.parseResume('gemini', 'gemini-x', 'text')`);
check('a missing key gives a clear message', !noKey.ok && noKey.error?.code === 'no_key', noKey);

// Images: resized and re-encoded on this computer, kept in IndexedDB.
const imgChooser = page.waitForEvent('filechooser');
const imgPick = page.evaluate(`pb.files.pickImage('p1', 'photo')`) as Promise<string>;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64',
);
await (await imgChooser).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
const img: R = JSON.parse(await imgPick);
check('image is processed and stored', img.ok && img.value.width === 2, img);
const assets = await pb(`pb.files.previewAssets('p1')`);
check(
  'preview gets a blob URL for the image',
  assets.ok && String(assets.value.photo?.src).startsWith('blob:'),
  assets,
);

// Rendering in the worker still works alongside everything else.
const spec = JSON.parse((await page.evaluate(`pb.worker.defaultSpec('developer')`)) as string);
check('default design loads', spec.sections?.length > 3, spec);

// Device data is removed on sign-out.
await pb(`pb.clearDevice()`);
const afterClear = await pb(`pb.keys.list()`);
check(
  'clearing the device removes keys',
  afterClear.ok && afterClear.value.length === 0,
  afterClear,
);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
