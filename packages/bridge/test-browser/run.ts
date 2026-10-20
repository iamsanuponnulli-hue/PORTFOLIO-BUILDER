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
const directionsReply = JSON.stringify({
  directions: [
    {
      name: 'Calm grid',
      description: 'Soft and quiet',
      preset: 'calm',
      sections: [
        { type: 'hero', variant: 'split' },
        { type: 'projects', variant: 'grid' },
        { type: 'contact', variant: 'simple' },
      ],
    },
    { name: 'Bold type', preset: 'bold', colors: { light: { text: '#eeeeee' } } },
    { name: 'Warm split', preset: 'warm', fonts: { heading: 'Georgia' } },
  ],
});
const assistantReply = JSON.stringify({
  summary: 'Rounder corners and testimonials after projects.',
  operations: [
    { op: 'updateTheme', tokens: { radius: 20 } },
    { op: 'addSection', type: 'testimonials', variant: 'grid', index: 3 },
    { op: 'setVariant', id: 'nope', variant: 'grid' },
  ],
});
const replyFor = (body: string) =>
  body.includes('three distinct design directions')
    ? directionsReply
    : body.includes('by returning a list of operations')
      ? assistantReply
      : resumeReply;
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
              message: { role: 'assistant', content: replyFor(body) },
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
const context = await browser.newContext({ acceptDownloads: true });
// Font downloads are answered locally so the test doesn't depend on Google Fonts.
await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 503, body: '' }));
const page = await context.newPage();
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

// ---- Design, editing, export (Phases 3–6) ----
const content = {
  profile: {
    name: 'Jane Doe',
    headline: 'Engineer',
    tagline: 'I build fast web apps.',
    bio: 'I build things.',
    location: '',
    email: 'jane@example.com',
    socials: [],
    photo: { assetId: 'photo', alt: 'Jane' },
  },
  experience: [
    {
      id: 'e1',
      company: 'Brightcart',
      role: 'Engineer',
      start: '2022',
      end: 'Present',
      location: '',
      bullets: ['Cut load time.'],
      tech: [],
    },
  ],
  projects: [
    {
      id: 'p1',
      title: 'Tidepool',
      summary: 'Notes app',
      role: '',
      tech: ['TS'],
      links: [],
      images: [],
      tags: [],
      featured: false,
    },
  ],
  skills: [{ group: 'Skills', items: ['TypeScript'] }],
  education: [],
  certifications: [],
  awards: [],
  writing: [],
  testimonials: [],
};
const state = {
  content,
  spec,
  custom: { css: '', js: '', sections: {} },
  contactForm: { service: 'none', value: '' },
};
const S = JSON.stringify(JSON.stringify(state));

const curated = await pb(`pb.site.directions('designer', '{"tone":"bold"}', '[]', 0)`);
check(
  'three designs without AI',
  curated.ok && curated.value.length === 3 && curated.value[0].name === 'Bold',
  curated,
);

const aiDirs = await pb(
  `pb.ai.directions('custom', 'mock-large', ${JSON.stringify(JSON.stringify({ profileType: 'developer', goals: {}, state, inspiration: [] }))})`,
);
check(
  'AI designs are validated into readable specs',
  aiDirs.ok &&
    aiDirs.value.directions.length === 3 &&
    aiDirs.value.directions[0].spec.sections[0].variant === 'split' &&
    aiDirs.value.directions[2].spec.theme.fonts.heading === 'Fraunces',
  aiDirs,
);

const proposal = await pb(
  `pb.ai.assistant('custom', 'mock-large', ${JSON.stringify(JSON.stringify({ prompt: 'rounder, add testimonials', state }))})`,
);
check(
  'assistant proposal keeps changes that fit and lists them',
  proposal.ok &&
    proposal.value.operations.length === 2 &&
    proposal.value.skipped.length === 1 &&
    proposal.value.changes.includes('Added section: Kind words') &&
    proposal.value.state.spec.theme.radius === 20,
  proposal,
);

const usage = await pb(`pb.usage.list()`);
check(
  'AI usage is counted on this device',
  usage.ok && usage.value.some((u: { requests: number }) => u.requests >= 2),
  usage,
);

const preview = JSON.parse(
  (await page.evaluate(`pb.worker.render(${S}, '{"mode":"preview","editable":true}')`)) as string,
);
const editorDoc = (await page.evaluate(
  (f) =>
    (
      window as unknown as { pb: { previewDocument(a: string, b: string, c: boolean): string } }
    ).pb.previewDocument(f, 'index.html', true),
  JSON.stringify(preview.files),
)) as string;
check(
  'editor preview has inline editing',
  editorDoc.includes('data-pb-edit') && editorDoc.includes("pb:'select'"),
  editorDoc.length,
);

const exported = JSON.parse(
  (await page.evaluate(`pb.worker.render(${S}, '{"mode":"export"}')`)) as string,
);
const html: string = exported.files['index.html'];
const edited = html.replace('<section id="about"', '<section data-mine="1" id="about"');
const code = await pb(`pb.site.codeEdit(${JSON.stringify(html)}, ${JSON.stringify(edited)}, ${S})`);
check(
  'code mode turns an edited section into custom code',
  code.ok && code.value.converted?.[0] === 'about',
  code,
);
const broken = await pb(
  `pb.site.codeEdit(${JSON.stringify(html)}, ${JSON.stringify(html.replace('<title>', '<title>x'))}, ${S})`,
);
check(
  'code mode refuses edits outside sections, with a line',
  broken.ok && broken.value.error?.line > 1,
  broken,
);

const full = await pb(`pb.checks.full(${JSON.stringify(JSON.stringify(exported.files))})`);
check(
  'full checks run axe at three widths',
  full.ok &&
    full.value.widths.length === 3 &&
    full.value.widths.every(
      (w: { overflow: boolean; axe: unknown[] }) => !w.overflow && Array.isArray(w.axe),
    ),
  full,
);
const score = await pb(`pb.site.score('p1', ${S}, ${JSON.stringify(JSON.stringify(full.value))})`);
check('portfolio score is computed', score.ok && score.value.full && score.value.total > 50, score);

const zipDownload = page.waitForEvent('download');
const zipped = await pb(`pb.export.zip('p1', ${S}, false)`);
const dl = await zipDownload;
check(
  'site ZIP is built and downloaded',
  zipped.ok && dl.suggestedFilename() === 'jane-doe-portfolio.zip' && zipped.value.files > 6,
  zipped,
);
check(
  'missing fonts are explained',
  zipped.value?.notes?.[0]?.includes('Fonts'),
  zipped.value?.notes,
);
const { unzipSync } = await import('fflate');
const zipBytes = readFileSync((await dl.path())!);
const entries = Object.keys(unzipSync(new Uint8Array(zipBytes)));
check(
  'ZIP has the site, the photo and a README',
  ['index.html', 'README.md', 'favicon.ico', 'og-image.png'].every((f) => entries.includes(f)) &&
    entries.some((e) => e.startsWith('assets/img/photo')),
  entries,
);

const backupDownload = page.waitForEvent('download');
const backed = await pb(
  `pb.backup.download('p1', ${JSON.stringify(JSON.stringify({ name: 'Jane', content }))}, 'Jane Doe')`,
);
const backupFile = await (await backupDownload).path();
check('backup is downloaded', backed.ok && backed.value.bytes > 100, backed);
const backupChooser = page.waitForEvent('filechooser');
const picked = page.evaluate(`pb.backup.pick()`) as Promise<string>;
await (await backupChooser).setFiles(backupFile!);
const opened: R = JSON.parse(await picked);
check(
  'backup opens with its project and files',
  opened.ok && opened.value.project.name === 'Jane' && opened.value.files >= 2,
  opened,
);
const restored = await pb(`pb.backup.restoreFiles('${opened.value?.token}', 'p2')`);
const p2 = await pb(`pb.files.previewAssets('p2')`);
check(
  'backup images are restored for another project',
  restored.ok && String(p2.value?.photo?.src).startsWith('blob:'),
  { restored, p2 },
);

const shotChooser = page.waitForEvent('filechooser');
const shots = page.evaluate(`pb.inspiration.upload('p1')`) as Promise<string>;
await (await shotChooser).setFiles({ name: 'site.png', mimeType: 'image/png', buffer: png });
const uploaded: R = JSON.parse(await shots);
check(
  'uploaded screenshots give a palette',
  uploaded.ok &&
    uploaded.value[0].brief.palette.length >= 1 &&
    uploaded.value[0].source === 'upload',
  uploaded,
);
const noExt = await pb(`pb.inspiration.capture('p1', 'https://example.com')`);
check(
  'capture without the extension says so',
  !noExt.ok && noExt.error?.code === 'no_extension',
  noExt,
);

const editorText = await page.evaluate(async () => {
  const pbx = (
    window as unknown as {
      pb: {
        code: {
          mount(e: HTMLElement, t: string, l: string, r: boolean, d: boolean): Promise<number>;
          getText(i: number): string;
          setText(i: number, t: string): void;
        };
      };
    }
  ).pb;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const id = await pbx.code.mount(host, 'body { color: red; }', 'css', false, false);
  pbx.code.setText(id, 'p {}');
  return pbx.code.getText(id) + '|' + (host.querySelector('.cm-editor') ? 'mounted' : 'missing');
});
check('code editor loads on demand', editorText === 'p {}|mounted', editorText);

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
