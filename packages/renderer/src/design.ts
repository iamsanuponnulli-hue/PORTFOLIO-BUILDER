import type {
  DesignBrief,
  DesignDraft,
  Inspiration,
  ProfileType,
  SectionType,
  SiteSpec,
  ThemeTokens,
} from '@pb/schema';
import { hasVariant, NAV_VARIANTS, SECTION_CATALOG } from './catalog.ts';
import {
  colorsInText,
  contrast,
  ensureContrast,
  isDark,
  mix,
  parseHex,
  readableOn,
  saturation,
} from './color.ts';
import { defaultSpec, findPreset, PRESETS, profilePreset } from './defaults.ts';
import { FONTS, findFont } from './fonts.ts';

type ColorSet = ThemeTokens['colors']['light'];
type Section = SiteSpec['sections'][number];

/** One of the designs offered after setup: same content, different look. */
export interface Direction {
  id: string;
  name: string;
  description: string;
  spec: SiteSpec;
}

/** What the person told us in setup that shapes the design. */
export interface DesignGoals {
  tone?: string;
  colorPreference?: string;
  colorMode?: 'light' | 'dark' | 'auto';
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Fixes a colour set so every text colour is readable: body text and secondary text
 * at 4.5:1 on the background and on cards, links and buttons at 3:1.
 */
export function readableColors(c: ColorSet): ColorSet {
  const text = ensureContrast(ensureContrast(c.text, c.background, 4.5), c.surface, 4.5);
  const muted = ensureContrast(ensureContrast(c.muted, c.background, 4.5), c.surface, 4.5);
  const primary = ensureContrast(c.primary, c.background, 3);
  return { ...c, text, muted, primary };
}

/** Makes every colour set in a theme readable (both modes). */
export function readableTheme(t: ThemeTokens): ThemeTokens {
  return {
    ...t,
    colors: { light: readableColors(t.colors.light), dark: readableColors(t.colors.dark) },
  };
}

/** Closest curated font for any family name a model or reference site mentions. */
export function closestFont(name: unknown, role: 'heading' | 'body' | 'mono'): string | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  const n = name.toLowerCase().replace(/["']/g, '').split(',')[0]!.trim();
  const exact = FONTS.find((f) => f.family.toLowerCase() === n);
  if (exact) return exact.family;
  const partial = FONTS.find((f) => n.includes(f.family.toLowerCase()));
  if (partial) return partial.family;
  if (role === 'mono' || /mono|code|courier|consol/.test(n))
    return role === 'mono' ? 'JetBrains Mono' : undefined;
  if (/serif|garamond|georgia|times|playfair|merriweather|libre|baskerville|caslon|didot/.test(n))
    return /sans/.test(n) ? 'Inter' : role === 'heading' ? 'Fraunces' : 'Source Serif 4';
  if (/display|grotesk|syne|clash|druk|bebas|anton|futura|archivo/.test(n)) return 'Space Grotesk';
  if (/helvetica|arial|inter|roboto|sf|system|segoe|neue|geist|sans/.test(n)) return 'Inter';
  return undefined;
}

/** A full colour set from a background and a primary colour. */
function colorSetFrom(background: string, primary: string, accent?: string): ColorSet {
  const dark = isDark(background);
  const text = dark ? mix(background, '#ffffff', 0.92) : mix(background, '#000000', 0.88);
  const surface = dark ? mix(background, '#ffffff', 0.05) : mix(background, '#ffffff', 0.7);
  return readableColors({
    background,
    surface,
    text,
    muted: mix(text, background, 0.4),
    primary,
    accent: accent ?? primary,
    border: mix(background, text, 0.13),
  });
}

/** Light and dark colours built around a primary colour. */
export function themeColorsFrom(
  primary: string,
  accent?: string,
  base?: ThemeTokens['colors'],
): ThemeTokens['colors'] {
  const lightBg = base?.light.background ?? '#fbfbfa';
  const darkBg = base?.dark.background ?? '#111315';
  return {
    light: colorSetFrom(lightBg, primary, accent),
    dark: colorSetFrom(
      darkBg,
      mix(primary, '#ffffff', 0.35),
      accent && mix(accent, '#ffffff', 0.3),
    ),
  };
}

const MOOD_PRESET: [RegExp, string][] = [
  [/calm|soft|clean|friendly|fresh/, 'calm'],
  [/bold|loud|strong|energetic|brutal/, 'bold'],
  [/elegant|editorial|classic|luxur|refined|serif/, 'editorial'],
  [/tech|developer|code|terminal|precise|engineer/, 'technical'],
  [/warm|playful|fun|cheer|cosy|cozy|human/, 'warm'],
  [/minimal|mono|stark|simple|plain|swiss/, 'mono'],
];

export const TONE_PRESET: Record<string, string> = {
  minimal: 'calm',
  bold: 'bold',
  playful: 'warm',
  elegant: 'editorial',
  technical: 'technical',
};

function presetForWords(words: string[]): string | undefined {
  const text = words.join(' ').toLowerCase();
  return MOOD_PRESET.find(([re]) => re.test(text))?.[1];
}

/** Layout words from a brief ("split hero", "timeline") → section layouts. */
const LAYOUT_HINTS: [RegExp, SectionType, string][] = [
  [/split|side.by.side|photo.*hero|hero.*photo/, 'hero', 'split'],
  [/center/, 'hero', 'centered'],
  [/big|large|huge|oversized|display type|typograph/, 'hero', 'bigtype'],
  [/terminal|console|command/, 'hero', 'terminal'],
  [/card|grid|tiles/, 'projects', 'grid'],
  [/featured|showcase|large work|case stud/, 'projects', 'featured'],
  [/\blist\b|index|rows/, 'projects', 'list'],
  [/timeline/, 'experience', 'timeline'],
  [/compact/, 'experience', 'compact'],
  [/masonry/, 'gallery', 'masonry'],
];

function applyLayoutHints(sections: Section[], traits: string[]): Section[] {
  const text = traits.join(' ').toLowerCase();
  const picks = new Map<SectionType, string>();
  for (const [re, type, variant] of LAYOUT_HINTS)
    if (re.test(text) && !picks.has(type)) picks.set(type, variant);
  return sections.map((s) => (picks.has(s.type) ? { ...s, variant: picks.get(s.type)! } : s));
}

/** Theme with a brief's palette, fonts and spacing borrowed as the user chose. */
export function applyBrief(
  theme: ThemeTokens,
  brief: DesignBrief,
  borrow: Inspiration['borrow'],
): ThemeTokens {
  let t = theme;
  if (borrow.colors && brief.palette.length) {
    const palette = brief.palette.map((c) => parseHex(c)).filter((c): c is string => !!c);
    const vivid = [...palette].sort((a, b) => saturation(b) - saturation(a));
    const primary = vivid[0] ?? t.colors.light.primary;
    const accent = vivid[1] ?? primary;
    const bg = palette.find((c) =>
      brief.background === 'dark' ? isDark(c) : !isDark(c) && saturation(c) < 0.25,
    );
    const colors = themeColorsFrom(primary, accent, t.colors);
    if (bg) {
      const mode = isDark(bg) ? 'dark' : 'light';
      colors[mode] = colorSetFrom(
        bg,
        mode === 'dark' ? mix(primary, '#ffffff', 0.35) : primary,
        accent,
      );
    }
    t = { ...t, colors };
    if (brief.background === 'dark' && t.colorMode === 'light') t = { ...t, colorMode: 'dark' };
  }
  if (borrow.fonts) {
    const heading = closestFont(brief.fonts.heading, 'heading');
    const body = closestFont(brief.fonts.body, 'body');
    t = { ...t, fonts: { ...t.fonts, ...(heading ? { heading } : {}), ...(body ? { body } : {}) } };
  }
  if (borrow.layout)
    t = { ...t, density: brief.density, radius: clamp(brief.radius, 0, 32, t.radius) };
  return readableTheme(t);
}

function uniqueIds(sections: Section[]): Section[] {
  const taken = new Set<string>();
  return sections.map((s) => {
    let id = s.id;
    for (let n = 2; taken.has(id); n++) id = `${s.id}-${n}`;
    taken.add(id);
    return id === s.id ? s : { ...s, id };
  });
}

/**
 * Turns a model's design draft into a valid SiteSpec: unknown sections are dropped,
 * unknown layouts fall back to the first one, numbers are clamped, fonts are mapped to
 * the curated list and colours are made readable. Content is never part of a design.
 */
export function specFromDraft(draft: DesignDraft, profileType: ProfileType): SiteSpec {
  const presetId = typeof draft.preset === 'string' ? draft.preset.toLowerCase() : undefined;
  const base = defaultSpec(profileType, findPreset(presetId ?? '') ? presetId : undefined);
  const t = base.theme;
  const color = (mode: 'light' | 'dark', key: keyof ColorSet) =>
    parseHex(draft.colors?.[mode]?.[key]) ?? t.colors[mode][key];
  const set = (mode: 'light' | 'dark'): ColorSet => ({
    background: color(mode, 'background'),
    surface: color(mode, 'surface'),
    text: color(mode, 'text'),
    muted: color(mode, 'muted'),
    primary: color(mode, 'primary'),
    accent: color(mode, 'accent'),
    border: color(mode, 'border'),
  });
  const light = set('light');
  const dark = set('dark');
  // A "light" set with a dark background (or the reverse) would break the mode switch.
  if (isDark(light.background))
    Object.assign(light, t.colors.light, { primary: light.primary, accent: light.accent });
  if (!isDark(dark.background)) Object.assign(dark, t.colors.dark);

  const theme: ThemeTokens = readableTheme({
    colors: { light, dark },
    fonts: {
      heading: closestFont(draft.fonts?.heading, 'heading') ?? t.fonts.heading,
      body: closestFont(draft.fonts?.body, 'body') ?? t.fonts.body,
      mono: t.fonts.mono,
    },
    scale: clamp(draft.scale, 1.1, 1.5, t.scale),
    radius: clamp(draft.radius, 0, 32, t.radius),
    density: oneOf(draft.density, ['compact', 'comfortable', 'roomy'] as const, t.density),
    shadow: oneOf(draft.shadow, ['none', 'soft', 'strong'] as const, t.shadow),
    motion: oneOf(draft.motion, ['none', 'subtle', 'lively'] as const, t.motion),
    width: clamp(draft.width, 720, 1440, t.width),
    colorMode: oneOf(draft.colorMode, ['light', 'dark', 'auto'] as const, t.colorMode),
  });

  let sections = base.sections;
  if (draft.sections?.length) {
    const fromDraft: Section[] = [];
    for (const s of draft.sections) {
      const known = Object.hasOwn(SECTION_CATALOG, s.type) ? (s.type as SectionType) : undefined;
      if (!known || known === 'custom') continue;
      const type = { data: known };
      const variant =
        s.variant && hasVariant(type.data, s.variant)
          ? s.variant
          : (base.sections.find((b) => b.type === type.data)?.variant ??
            SECTION_CATALOG[type.data].variants[0]!.id);
      const options = { ...(base.sections.find((b) => b.type === type.data)?.options ?? {}) };
      if (s.title?.trim()) options['title'] = s.title.trim();
      fromDraft.push({
        id: type.data,
        type: type.data,
        variant,
        visible: true,
        options,
        custom: false,
      });
    }
    if (fromDraft.some((s) => s.type === 'hero')) sections = uniqueIds(fromDraft);
  }
  const nav = NAV_VARIANTS.some((v) => v.id === draft.nav) ? draft.nav! : base.nav.variant;
  return { ...base, theme, nav: { variant: nav }, sections };
}

/** Rotates through a section's layouts so each direction looks different. */
function vary(sections: Section[], step: number): Section[] {
  if (step === 0) return sections;
  return sections.map((s) => {
    const variants = SECTION_CATALOG[s.type].variants;
    if (variants.length < 2 || s.type === 'contact') return s;
    // The terminal intro only suits developers' default; skip it when varying.
    const pool = s.type === 'hero' ? variants.filter((v) => v.id !== 'terminal') : variants;
    const at = Math.max(
      0,
      pool.findIndex((v) => v.id === s.variant),
    );
    return { ...s, variant: pool[(at + step) % pool.length]!.id };
  });
}

const DESCRIPTIONS: Record<string, string> = {
  calm: 'Soft colours, rounded cards and plenty of space.',
  bold: 'Big type, strong contrast and lively motion.',
  editorial: 'Serif headings and a magazine feel.',
  technical: 'Crisp, code-friendly and dark by default.',
  warm: 'Friendly colours and rounded shapes.',
  mono: 'Black and white, nothing extra.',
};

/**
 * Three designs made without AI, from the profile type's layout, the tone and colour
 * wishes from setup and any inspiration the person added. `round` gives different
 * designs for "Generate 3 more".
 */
export function curatedDirections(
  profileType: ProfileType,
  goals: DesignGoals,
  inspiration: Inspiration[] = [],
  round = 0,
): Direction[] {
  const used = inspiration.filter(
    (i) => i.borrow.colors || i.borrow.fonts || i.borrow.layout || i.borrow.mood,
  );
  const moodPreset = presetForWords(used.filter((i) => i.borrow.mood).flatMap((i) => i.brief.mood));
  const order = [
    ...new Set(
      [
        TONE_PRESET[goals.tone ?? ''],
        moodPreset,
        profilePreset(profileType),
        ...PRESETS.map((p) => p.id),
      ].filter((x): x is string => !!x),
    ),
  ];
  const wished = colorsInText(goals.colorPreference ?? '');
  const out: Direction[] = [];
  for (let i = 0; i < 3; i++) {
    const k = round * 3 + i;
    const presetId = order[k % order.length]!;
    const preset = findPreset(presetId)!;
    const base = defaultSpec(profileType, presetId);
    let theme = structuredClone(preset.theme);
    let name = preset.label;
    if (wished.length) {
      theme = { ...theme, colors: themeColorsFrom(wished[0]!, wished[1], theme.colors) };
    }
    // Each reference shapes one direction (the first ones), so they stay distinct.
    const ref = used[k % Math.max(1, used.length)];
    let sections = vary(base.sections, Math.floor(k / order.length) + (k % 2));
    if (ref && k < used.length + 1) {
      theme = applyBrief(theme, ref.brief, ref.borrow);
      if (ref.borrow.layout) sections = applyLayoutHints(sections, ref.brief.layout);
      name = `${preset.label}, like ${ref.title || 'your reference'}`.slice(0, 60);
    }
    if (goals.colorMode) theme = { ...theme, colorMode: goals.colorMode };
    out.push({
      id: `d${k + 1}`,
      name,
      description: DESCRIPTIONS[presetId] ?? '',
      spec: { ...base, theme: readableTheme(theme), sections },
    });
  }
  return out;
}

/** Readable text on a colour, for swatches in the editor. */
export const swatchText = readableOn;

/** True when a theme passes every contrast check (used in tests and fixes). */
export function themeIsReadable(t: ThemeTokens): boolean {
  return (['light', 'dark'] as const).every((m) => {
    const c = t.colors[m];
    return (
      contrast(c.text, c.background) >= 4.5 &&
      contrast(c.text, c.surface) >= 4.5 &&
      contrast(c.muted, c.background) >= 4.5 &&
      contrast(c.primary, c.background) >= 3
    );
  });
}

export { findFont };

/** Styles read from a page by the extension (same shape as @pb/ai's PageStyles). */
export interface StyleSample {
  colors?: string[];
  backgrounds?: string[];
  fonts?: { family: string; uses: number; heading?: boolean }[];
  radius?: number[];
  structure?: string[];
}

/** A design brief straight from page styles (no AI needed). */
export function briefFromStyles(s: StyleSample): DesignBrief {
  const bg = (s.backgrounds ?? []).map((c) => parseHex(c)).find(Boolean);
  const colors = (s.colors ?? []).map((c) => parseHex(c)).filter((c): c is string => !!c);
  const palette = [...new Set([...(bg ? [bg] : []), ...colors])].slice(0, 6);
  const fonts = s.fonts ?? [];
  const heading = fonts.find((f) => f.heading)?.family ?? fonts[0]?.family ?? '';
  const body = fonts.find((f) => !f.heading)?.family ?? fonts[0]?.family ?? '';
  const notes = (s.structure ?? []).join(' ').toLowerCase();
  const layout: string[] = [];
  if (/hero: with image/.test(notes)) layout.push('split hero');
  if (/centered/.test(notes)) layout.push('centered hero');
  const h1 = Number(/h1 size: (\d+)px/.exec(notes)?.[1] ?? 0);
  if (h1 >= 64) layout.push('big type');
  if (/card\/grid/.test(notes)) layout.push('card grid');
  const radius = s.radius?.[0] ?? 8;
  return {
    palette,
    background: bg && isDark(bg) ? 'dark' : 'light',
    fonts: { heading: heading.slice(0, 60), body: body.slice(0, 60) },
    layout,
    mood: [],
    density: h1 >= 64 ? 'roomy' : 'comfortable',
    radius: Math.max(0, Math.min(32, radius)),
  };
}
