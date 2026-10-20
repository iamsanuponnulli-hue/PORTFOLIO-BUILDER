import type { PageStyles } from './protocol.ts';

/** What readPage() collects inside the page (raw, summarised by summarize()). */
export interface RawSample {
  title: string;
  url: string;
  /** [cssColour, weight] for text colours (weight: text length). */
  text: [string, number][];
  /** [cssColour, weight] for backgrounds (weight: visible area). */
  backgrounds: [string, number][];
  /** [cssColour, weight] for borders, links and buttons. */
  accents: [string, number][];
  /** [fontFamily, weight, isHeading]. */
  fonts: [string, number, boolean][];
  variables: Record<string, string>;
  radius: number[];
  structure: string[];
}

/**
 * Runs inside the reference page (injected with chrome.scripting.executeScript),
 * so it must be self-contained: no imports, no outside variables.
 */
export function readPage(): RawSample {
  const text: [string, number][] = [];
  const backgrounds: [string, number][] = [];
  const accents: [string, number][] = [];
  const fonts: [string, number, boolean][] = [];
  const radius: number[] = [];
  const viewArea = innerWidth * Math.max(innerHeight, 1);
  const els = Array.from(document.querySelectorAll<HTMLElement>('body, body *')).slice(0, 1500);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top > innerHeight * 3) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) continue;
    const area = Math.min(r.width * r.height, viewArea) / viewArea;
    if (cs.backgroundColor && !/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor))
      backgrounds.push([cs.backgroundColor, area]);
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? '')
      .join('')
      .trim().length;
    if (own > 0) {
      const heading = /^H[1-3]$/.test(el.tagName) || parseFloat(cs.fontSize) >= 28;
      text.push([cs.color, own]);
      fonts.push([cs.fontFamily, own, heading]);
    }
    if (el.tagName === 'A' || el.tagName === 'BUTTON') {
      accents.push([cs.color, 2]);
      if (!/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor))
        accents.push([cs.backgroundColor, 3]);
    }
    const br = parseFloat(cs.borderTopLeftRadius);
    if (br > 0 && br < 100 && r.width > 40) radius.push(Math.round(br));
  }
  const variables: Record<string, string> = {};
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // other-origin stylesheet
      }
      for (const rule of Array.from(rules)) {
        const style = (rule as CSSStyleRule).style;
        if (!style || !/^(:root|html|body)$/.test((rule as CSSStyleRule).selectorText ?? ''))
          continue;
        for (let i = 0; i < style.length && Object.keys(variables).length < 60; i++) {
          const name = style[i]!;
          if (
            name.startsWith('--') &&
            /color|colour|bg|font|radius|accent|primary|brand/i.test(name)
          )
            variables[name] = style.getPropertyValue(name).trim().slice(0, 80);
        }
      }
    }
  } catch {
    // ignore
  }
  const structure: string[] = [];
  const nav = document.querySelector('nav');
  if (nav) structure.push(`nav: ${nav.querySelectorAll('a').length} links`);
  const h1 = document.querySelector('h1');
  if (h1) {
    const hero = h1.closest('section, header, div') ?? h1.parentElement;
    const img = hero?.querySelector('img, picture, svg, video');
    const align = getComputedStyle(h1).textAlign;
    structure.push(
      `hero: ${img ? 'with image' : 'text only'}, ${align === 'center' ? 'centered' : 'left aligned'}`,
    );
    structure.push(`h1 size: ${Math.round(parseFloat(getComputedStyle(h1).fontSize))}px`);
  }
  const grids = Array.from(document.querySelectorAll('ul, ol, div, section')).filter((e) => {
    const d = getComputedStyle(e).display;
    return (d === 'grid' || d === 'flex') && e.children.length >= 3;
  }).length;
  if (grids) structure.push(`${grids} card/grid groups`);
  structure.push(`${document.querySelectorAll('section').length} sections`);
  return {
    title: document.title.slice(0, 160),
    url: location.href,
    text,
    backgrounds,
    accents,
    fonts,
    variables,
    radius,
    structure,
  };
}

/** "rgb(12, 34, 56)" / "rgba(…)" / "#abc" → "#0c2238" (opaque colours only). */
export function cssToHex(c: string): string | undefined {
  const s = c.trim().toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    if (a < 0.5) return undefined;
    return `#${[m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('')}`;
  }
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (h) return h[1]!.length === 3 ? `#${[...h[1]!].map((x) => x + x).join('')}` : `#${h[1]}`;
  return undefined;
}

function top(samples: [string, number][], n: number): string[] {
  const weights = new Map<string, number>();
  for (const [css, w] of samples) {
    const hex = cssToHex(css);
    if (hex) weights.set(hex, (weights.get(hex) ?? 0) + w);
  }
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const picked: string[] = [];
  for (const [hex] of [...weights].sort((a, b) => b[1] - a[1])) {
    const [r, g, b] = rgb(hex);
    if (
      picked.some((p) => {
        const [x, y, z] = rgb(p);
        return Math.hypot(r! - x!, g! - y!, b! - z!) < 24;
      })
    )
      continue;
    picked.push(hex);
    if (picked.length >= n) break;
  }
  return picked;
}

const firstFamily = (f: string) => f.split(',')[0]!.replace(/["']/g, '').trim();

/** Turns raw samples into the compact styles sent to the app (and the AI). */
export function summarize(raw: RawSample): PageStyles {
  const fontWeights = new Map<string, { uses: number; heading: number }>();
  for (const [fam, w, heading] of raw.fonts) {
    const name = firstFamily(fam);
    if (!name) continue;
    const f = fontWeights.get(name) ?? { uses: 0, heading: 0 };
    f.uses += w;
    if (heading) f.heading += w;
    fontWeights.set(name, f);
  }
  const fonts = [...fontWeights]
    .sort((a, b) => b[1].uses - a[1].uses)
    .slice(0, 4)
    .map(([family, f]) => ({ family, uses: f.uses, heading: f.heading > f.uses / 2 }));
  const radius = [...new Set(raw.radius)]
    .sort(
      (a, b) => raw.radius.filter((x) => x === b).length - raw.radius.filter((x) => x === a).length,
    )
    .slice(0, 3);
  return {
    url: raw.url,
    title: raw.title,
    backgrounds: top(raw.backgrounds, 3),
    colors: top([...raw.accents, ...raw.text], 6),
    fonts,
    variables: raw.variables,
    radius,
    structure: raw.structure.slice(0, 8),
  };
}
