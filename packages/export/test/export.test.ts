import { sampleState } from '@pb/renderer/samples';
import { fontFileSlug } from '@pb/renderer';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  BackupError,
  buildSite,
  createBackup,
  fetchFonts,
  latinFontUrls,
  pngsToIco,
  readBackup,
  zipFiles,
  zipName,
} from '../src/index.ts';

const bytes = (n: number, v = 1) => new Uint8Array(n).fill(v);
const text = (f: Uint8Array | undefined) => strFromU8(f!);

describe('site export', () => {
  const state = sampleState('developer');

  it('builds a complete site with relative paths and no missing references', () => {
    const state = sampleState('professional');
    const photo = state.content.profile.photo?.assetId ?? 'photo';
    const s = {
      ...state,
      content: {
        ...state.content,
        profile: { ...state.content.profile, photo: { assetId: photo, alt: 'Me' } },
      },
    };
    const out = buildSite({
      state: s,
      images: [
        {
          fileId: photo,
          mediaType: 'image/jpeg',
          data: bytes(10),
          width: 800,
          height: 800,
          variants: { 480: bytes(5), 960: bytes(6) },
        },
      ],
      favicon: bytes(4),
      ogImage: bytes(4),
      resume: { name: 'cv.pdf', data: bytes(3) },
    });
    const paths = Object.keys(out.files);
    expect(paths).toEqual(
      expect.arrayContaining([
        'index.html',
        'assets/css/theme.css',
        'favicon.ico',
        'og-image.png',
        'resume.pdf',
        'README.md',
        `assets/img/${photo}.jpg`,
        `assets/img/${photo}-480.webp`,
      ]),
    );
    const html = text(out.files['index.html']);
    expect(html).toContain(`assets/img/${photo}-480.webp 480w`);
    expect(html).toContain('href="resume.pdf" download');
    for (const m of html.matchAll(/(?:href|src)="(assets\/[^"]+|favicon\.ico)"/g))
      expect(paths).toContain(m[1]);
    expect(html).not.toContain('fonts.googleapis');
  });

  it('bundles fonts when every file is available, and explains when not', () => {
    const missing = buildSite({ state, images: [] });
    expect(missing.notes[0]).toMatch(/Fonts couldn't be downloaded/);
    expect(text(missing.files['assets/css/theme.css'])).not.toContain('@font-face');

    const t = state.spec.theme.fonts;
    const fonts: Record<string, Uint8Array> = {};
    for (const f of [t.heading, t.body, t.mono])
      for (const w of [400, 500, 600, 700, 800]) fonts[fontFileSlug(f, w)] = bytes(2);
    const ok = buildSite({ state, images: [], fonts });
    expect(ok.notes).toEqual([]);
    expect(text(ok.files['assets/css/theme.css'])).toContain('url("../fonts/');
    expect(Object.keys(ok.files).some((p) => p.startsWith('assets/fonts/'))).toBe(true);
  });

  it('includes a variable font once for all its weights', () => {
    const t = state.spec.theme.fonts;
    const families = [...new Set([t.heading, t.body, t.mono])];
    const fonts: Record<string, Uint8Array> = {};
    families.forEach((f, i) => {
      for (const w of [400, 500, 600, 700, 800]) fonts[fontFileSlug(f, w)] = bytes(4, i + 1);
    });
    const out = buildSite({ state, images: [], fonts });
    const files = Object.keys(out.files).filter((p) => p.startsWith('assets/fonts/'));
    expect(files).toHaveLength(families.length);
    const css = text(out.files['assets/css/theme.css']);
    for (const m of css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g))
      expect(out.files[`assets/fonts/${m[1]}`]).toBeDefined();
  });

  it('zips the files and names the zip after the person', () => {
    const out = buildSite({ state, images: [] });
    const unzipped = unzipSync(zipFiles(out.files));
    expect(Object.keys(unzipped).sort()).toEqual(Object.keys(out.files).sort());
    expect(zipName(state)).toMatch(/^[a-z-]+-portfolio\.zip$/);
  });
});

describe('fonts', () => {
  const css = `/* cyrillic */
@font-face { font-family: 'Inter'; font-weight: 400; src: url(https://fonts.gstatic.com/c400.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Inter'; font-weight: 400; src: url(https://fonts.gstatic.com/l400.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Inter'; font-weight: 700; src: url(https://fonts.gstatic.com/l700.woff2) format('woff2'); }`;

  it('picks the Latin file for each weight', () => {
    expect([...latinFontUrls(css)]).toEqual([
      [400, 'https://fonts.gstatic.com/l400.woff2'],
      [700, 'https://fonts.gstatic.com/l700.woff2'],
    ]);
  });

  it('downloads what it can and skips the rest', async () => {
    const fake = (async (url: string) =>
      url.startsWith('https://fonts.googleapis.com')
        ? new Response(css)
        : new Response(bytes(3))) as unknown as typeof fetch;
    const files = await fetchFonts(['Inter', 'Unknown'], fake);
    expect(Object.keys(files).sort()).toEqual(['inter-400', 'inter-700']);
    const offline = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await fetchFonts(['Inter'], offline)).toEqual({});
  });
});

describe('favicon', () => {
  it('packs PNGs into an ICO directory', () => {
    const ico = pngsToIco([
      { size: 16, png: bytes(10) },
      { size: 32, png: bytes(20) },
    ]);
    const v = new DataView(ico.buffer);
    expect(v.getUint16(2, true)).toBe(1);
    expect(v.getUint16(4, true)).toBe(2);
    expect(v.getUint32(6 + 12, true)).toBe(38);
    expect(v.getUint32(6 + 16 + 12, true)).toBe(48);
    expect(ico.length).toBe(68);
  });
});

describe('backups', () => {
  it('round-trips the project and its files', () => {
    const b = createBackup({
      project: { name: 'Jane', content: { profile: { name: 'Jane' } } },
      files: [
        {
          fileId: 'photo',
          kind: 'image',
          mediaType: 'image/webp',
          alt: 'Me',
          data: bytes(5, 7),
          variants: { 480: bytes(2, 9) },
        },
        { fileId: 'resume', kind: 'resume', mediaType: 'application/pdf', data: bytes(3) },
      ],
      createdAt: 42,
    });
    const r = readBackup(b);
    expect(r.project['name']).toBe('Jane');
    expect(r.createdAt).toBe(42);
    expect(r.files[0]).toMatchObject({
      fileId: 'photo',
      alt: 'Me',
      data: bytes(5, 7),
      variants: { 480: bytes(2, 9) },
    });
    expect(r.files[1]!.variants).toBeUndefined();
  });

  it('rejects files that are not backups', () => {
    expect(() => readBackup(bytes(20))).toThrow(BackupError);
    expect(() => readBackup(zipFiles({ 'x.txt': bytes(1) }))).toThrow(/isn't a portfolio backup/);
  });
});
