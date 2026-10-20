import { z } from 'zod';
import { Id } from './common.ts';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * What a reference site looks like, read from its styles (and screenshots when the
 * model can see images). Facts about design only: never content.
 */
export const DesignBrief = z
  .object({
    palette: z.array(Hex).max(8).default([]),
    /** Light or dark page background. */
    background: z.enum(['light', 'dark']).default('light'),
    fonts: z
      .object({
        heading: z.string().max(60).default(''),
        body: z.string().max(60).default(''),
      })
      .default({ heading: '', body: '' }),
    /** Short layout traits, e.g. "split hero", "card grid", "generous spacing". */
    layout: z.array(z.string().max(60)).max(8).default([]),
    /** Mood words, e.g. "calm", "playful". */
    mood: z.array(z.string().max(30)).max(6).default([]),
    density: z.enum(['compact', 'comfortable', 'roomy']).default('comfortable'),
    radius: z.number().min(0).max(32).default(8),
  })
  .meta({ id: 'DesignBrief' });
export type DesignBrief = z.infer<typeof DesignBrief>;

/** Which parts of a reference to borrow when generating designs. */
export const Borrow = z
  .object({
    colors: z.boolean().default(true),
    fonts: z.boolean().default(true),
    layout: z.boolean().default(false),
    mood: z.boolean().default(true),
  })
  .meta({ id: 'Borrow' });

/** A reference site, uploaded screenshot or gallery style the user likes. */
export const Inspiration = z
  .object({
    id: Id,
    source: z.enum(['extension', 'upload', 'gallery']).meta({ id: 'InspirationSource' }),
    /** Page address (extension captures) or gallery style id. */
    url: z.string().max(2048).default(''),
    title: z.string().max(160).default(''),
    brief: DesignBrief.default(DesignBrief.parse({})),
    borrow: Borrow.default(Borrow.parse({})),
    /** Screenshot file ids kept on this device (never uploaded). */
    screenshots: z.array(Id).max(4).default([]),
  })
  .meta({ id: 'Inspiration' });
export type Inspiration = z.infer<typeof Inspiration>;

const loose = <T extends z.ZodType>(t: T) => t.nullish().catch(undefined);
const LooseColors = z
  .object({
    background: loose(z.string()),
    surface: loose(z.string()),
    text: loose(z.string()),
    muted: loose(z.string()),
    primary: loose(z.string()),
    accent: loose(z.string()),
    border: loose(z.string()),
  })
  .partial();

/**
 * A design as a model writes it: every field optional and forgiving. The renderer
 * turns it into a valid SiteSpec (known sections and layouts, readable colours).
 */
export const DesignDraft = z.object({
  name: z.string().max(60).catch('Design'),
  description: z.string().max(300).catch(''),
  /** Built-in theme to start from (calm, bold, editorial, technical, warm, mono). */
  preset: loose(z.string()),
  colors: z
    .object({ light: LooseColors.nullish(), dark: LooseColors.nullish() })
    .partial()
    .nullish()
    .catch(undefined),
  fonts: z
    .object({ heading: loose(z.string()), body: loose(z.string()) })
    .partial()
    .nullish()
    .catch(undefined),
  radius: loose(z.number()),
  scale: loose(z.number()),
  width: loose(z.number()),
  density: loose(z.string()),
  shadow: loose(z.string()),
  motion: loose(z.string()),
  colorMode: loose(z.string()),
  nav: loose(z.string()),
  sections: z
    .array(
      z.object({
        type: z.string(),
        variant: z.string().nullish(),
        title: z.string().max(80).nullish(),
      }),
    )
    .nullish()
    .catch(undefined),
});
export type DesignDraft = z.infer<typeof DesignDraft>;
