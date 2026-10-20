import { fontFileSlug, findFont } from '@pb/renderer';

/**
 * Picks the Latin WOFF2 file for each weight from a Google Fonts stylesheet.
 * (Google serves one file per alphabet; the Latin one covers most portfolios.)
 */
export function latinFontUrls(css: string): Map<number, string> {
  const out = new Map<number, string>();
  const blocks = css.split('@font-face').slice(1);
  const comments = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face/gi)].map((m) => m[1]!);
  blocks.forEach((block, i) => {
    const subset = comments[i] ?? 'latin';
    if (subset !== 'latin') return;
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    if (weight && url && !out.has(weight)) out.set(weight, url);
  });
  return out;
}

/**
 * Downloads font files for the export from Google Fonts (which allows browser
 * requests). Returns files by slug; families that fail are simply missing.
 */
export async function fetchFonts(
  families: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  await Promise.all(
    families.map(async (family) => {
      const def = findFont(family);
      if (!def) return;
      try {
        const q = `family=${encodeURIComponent(def.family).replace(/%20/g, '+')}:wght@${def.weights.join(';')}`;
        const css = await (await fetchImpl(`https://fonts.googleapis.com/css2?${q}`)).text();
        const urls = latinFontUrls(css);
        await Promise.all(
          def.weights.map(async (w) => {
            const url = urls.get(w);
            if (!url) return;
            const res = await fetchImpl(url);
            if (res.ok) out[fontFileSlug(def.family, w)] = new Uint8Array(await res.arrayBuffer());
          }),
        );
      } catch {
        // Offline or blocked: the site falls back to system fonts.
      }
    }),
  );
  return out;
}
