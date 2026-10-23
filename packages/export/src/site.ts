import {
  fontFileSlug,
  findFont,
  fontsUsed,
  render,
  type AssetInfo,
  type CheckResult,
  type SiteState,
} from '@pb/renderer';
import { strToU8, zipSync, type Zippable } from 'fflate';
import { readme } from './readme.ts';

/** An image kept on the device, as the export needs it. */
export interface ExportImage {
  fileId: string;
  mediaType: string;
  data: Uint8Array;
  width?: number;
  height?: number;
  /** Resized copies by width (WebP). */
  variants?: Record<number, Uint8Array>;
}

export interface ExportInput {
  state: SiteState;
  images: ExportImage[];
  /** Font files by slug (see fontFileSlug); fonts missing here fall back to system fonts. */
  fonts?: Record<string, Uint8Array>;
  favicon?: Uint8Array;
  ogImage?: Uint8Array;
  /** Added as resume.pdf with a download link in the README. */
  resume?: { name: string; data: Uint8Array };
  now?: Date;
}

export interface ExportResult {
  files: Record<string, Uint8Array>;
  checks: CheckResult[];
  /** Things the person should know (e.g. a font couldn't be bundled). */
  notes: string[];
}

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

const safeId = (id: string) => id.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'image';

/** Every file of the downloadable site, with relative paths so it works anywhere. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function buildSite(input: ExportInput): ExportResult {
  const notes: string[] = [];
  const files: Record<string, Uint8Array> = {};
  const assets: Record<string, AssetInfo> = {};

  for (const im of input.images) {
    const base = `assets/img/${safeId(im.fileId)}`;
    const ext = EXT[im.mediaType] ?? 'bin';
    files[`${base}.${ext}`] = im.data;
    const widths = Object.keys(im.variants ?? {})
      .map(Number)
      .sort((a, b) => a - b);
    for (const w of widths) files[`${base}-${w}.webp`] = im.variants![w]!;
    assets[im.fileId] = {
      src: `${base}.${ext}`,
      ...(im.width && im.height ? { width: im.width, height: im.height } : {}),
      ...(widths.length > 1
        ? { srcset: widths.map((w) => `${base}-${w}.webp ${w}w`).join(', ') }
        : {}),
    };
  }

  // Bundle fonts only when every file is here; otherwise the theme's fallbacks apply.
  const fontsWanted = fontsUsed(input.state.spec.theme);
  const slugs = fontsWanted.flatMap((f) =>
    (findFont(f)?.weights ?? []).map((w) => fontFileSlug(f, w)),
  );
  const haveFonts = slugs.length > 0 && slugs.every((s) => input.fonts?.[s]);
  if (slugs.length && !haveFonts)
    notes.push(
      "Fonts couldn't be downloaded, so the site uses similar fonts already on visitors' devices. Export again when you're online to include them.",
    );

  const out = render(input.state, {
    mode: 'export',
    fontSource: haveFonts ? 'self-hosted' : 'system',
    assets,
    resume: !!input.resume,
    ...(input.now ? { now: input.now } : {}),
  });
  for (const [path, text] of Object.entries(out.files)) {
    // Empty optional files (no custom code, no scripts) are left out.
    if (!text && /(custom\.(css|js)|main\.js)$/.test(path)) continue;
    files[path] = strToU8(text);
  }
  if (haveFonts) {
    // Variable fonts come as one file for every weight: include it once.
    const kept: { slug: string; data: Uint8Array }[] = [];
    let css = out.files['assets/css/theme.css'] ?? '';
    for (const s of slugs) {
      const data = input.fonts![s]!;
      const same = kept.find((k) => sameBytes(k.data, data));
      if (same) css = css.split(`/${s}.woff2"`).join(`/${same.slug}.woff2"`);
      else {
        kept.push({ slug: s, data });
        files[`assets/fonts/${s}.woff2`] = data;
      }
    }
    if (css) files['assets/css/theme.css'] = strToU8(css);
  }
  if (input.favicon) files['favicon.ico'] = input.favicon;
  if (input.ogImage) files['og-image.png'] = input.ogImage;
  if (input.resume) files['resume.pdf'] = input.resume.data;
  // Pages only point at files that are in the ZIP.
  for (const page of Object.keys(out.files).filter((p) => p.endsWith('.html'))) {
    const html = out.files[page]!.replace(
      /\n?<(?:link rel="(?:stylesheet|icon)" href|script src)="(?:\.\.\/)?([^"]+)"(?: defer><\/script>|>)/g,
      (tag, path: string) => (files[path] ? tag : ''),
    );
    files[page] = strToU8(html);
  }
  files['README.md'] = strToU8(readme(input.state, { resume: !!input.resume, notes }));
  return { files, checks: out.checks, notes };
}

/** The site as one ZIP file. Images are already compressed, so they're stored as-is. */
export function zipFiles(files: Record<string, Uint8Array>, now = new Date()): Uint8Array {
  const z: Zippable = {};
  for (const [path, data] of Object.entries(files)) {
    const stored = /\.(webp|jpe?g|png|gif|avif|woff2|pdf|ico)$/i.test(path);
    z[path] = [data, { level: stored ? 0 : 9, mtime: now }];
  }
  return zipSync(z);
}

/** "jane-doe-portfolio.zip" */
export function zipName(state: SiteState): string {
  const slug = state.content.profile.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'my'}-portfolio.zip`;
}
