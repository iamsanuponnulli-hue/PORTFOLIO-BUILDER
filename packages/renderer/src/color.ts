/** WCAG colour maths for theme checks. */

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on the given background. */
export const readableOn = (bg: string) =>
  contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111';

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Mixes a towards b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as [number, number, number]);
}

/** 0 (grey) to 1 (vivid). */
export function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

export const isDark = (hex: string) => luminance(hex) < 0.18;

/**
 * Moves fg towards black or white (whichever gains contrast) until it reaches
 * `min` against bg. Keeps the hue as long as possible.
 */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = isDark(bg) ? '#ffffff' : '#000000';
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

/** Normalises "#ABC", "abcdef" etc. to "#aabbcc", or undefined. */
export function parseHex(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const long = /^#?([0-9a-f]{6})$/.exec(s);
  return long ? `#${long[1]}` : undefined;
}

const NAMED: Record<string, string> = {
  red: '#c62828',
  crimson: '#b0213f',
  orange: '#d9600b',
  amber: '#b7791f',
  yellow: '#b59a00',
  gold: '#a8820a',
  green: '#2e7d32',
  emerald: '#047857',
  teal: '#0f766e',
  cyan: '#0e7490',
  blue: '#1d4ed8',
  navy: '#1e3a8a',
  indigo: '#4338ca',
  purple: '#7e22ce',
  violet: '#6d28d9',
  pink: '#be185d',
  magenta: '#a21caf',
  brown: '#7c4a21',
  black: '#111111',
  grey: '#4b5563',
  gray: '#4b5563',
};

/** Colours mentioned in free text ("navy and gold", "#ff6600"), in order. */
export function colorsInText(text: string): string[] {
  const out: string[] = [];
  const re = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|[a-z]+/gi;
  for (const m of text.matchAll(re)) {
    const word = m[0].toLowerCase();
    const hex = word.startsWith('#') ? parseHex(word) : NAMED[word];
    if (hex && !out.includes(hex)) out.push(hex);
  }
  return out;
}
