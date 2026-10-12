/**
 * Curated, openly licensed (SIL OFL) font families. Export bundles their WOFF2 files
 * under assets/fonts/; the preview may load them from Google Fonts instead.
 */
export interface FontDef {
  family: string;
  category: 'sans' | 'serif' | 'mono' | 'display';
  fallback: string;
  weights: number[];
}

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const FONTS: FontDef[] = [
  { family: 'Inter', category: 'sans', fallback: SANS, weights: [400, 600, 700] },
  { family: 'Manrope', category: 'sans', fallback: SANS, weights: [400, 600, 800] },
  { family: 'DM Sans', category: 'sans', fallback: SANS, weights: [400, 500, 700] },
  { family: 'Work Sans', category: 'sans', fallback: SANS, weights: [400, 600, 700] },
  { family: 'IBM Plex Sans', category: 'sans', fallback: SANS, weights: [400, 600, 700] },
  { family: 'Outfit', category: 'sans', fallback: SANS, weights: [400, 600, 800] },
  { family: 'Space Grotesk', category: 'display', fallback: SANS, weights: [400, 500, 700] },
  { family: 'Syne', category: 'display', fallback: SANS, weights: [600, 800] },
  { family: 'Fraunces', category: 'serif', fallback: SERIF, weights: [400, 600, 800] },
  { family: 'Playfair Display', category: 'serif', fallback: SERIF, weights: [400, 700] },
  { family: 'Lora', category: 'serif', fallback: SERIF, weights: [400, 600] },
  { family: 'Source Serif 4', category: 'serif', fallback: SERIF, weights: [400, 600] },
  { family: 'IBM Plex Mono', category: 'mono', fallback: MONO, weights: [400, 600] },
  { family: 'JetBrains Mono', category: 'mono', fallback: MONO, weights: [400, 700] },
];

export const SYSTEM_SANS = SANS;
export const SYSTEM_MONO = MONO;

export const findFont = (family: string) => FONTS.find((f) => f.family === family);

/** CSS font-family value with fallbacks; unknown families degrade to system fonts. */
export function fontStack(family: string, kind: 'sans' | 'mono' = 'sans'): string {
  const def = findFont(family);
  if (!def) return kind === 'mono' ? MONO : SANS;
  return `"${def.family}", ${def.fallback}`;
}

export const fontFileSlug = (family: string, weight: number) =>
  `${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${weight}`;

/** @font-face rules pointing at bundled files (export mode). */
export function selfHostedFontFaces(families: string[], baseUrl: string): string {
  return families
    .map(findFont)
    .filter((f): f is FontDef => !!f)
    .flatMap((f) =>
      f.weights.map(
        (w) =>
          `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${w};font-display:swap;` +
          `src:url("${baseUrl}${fontFileSlug(f.family, w)}.woff2") format("woff2")}`,
      ),
    )
    .join('\n');
}

/** Google Fonts stylesheet URL (preview mode only). */
export function googleFontsUrl(families: string[]): string | undefined {
  const defs = families.map(findFont).filter((f): f is FontDef => !!f);
  if (defs.length === 0) return undefined;
  const q = defs
    .map(
      (f) =>
        `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights.join(';')}`,
    )
    .join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}
