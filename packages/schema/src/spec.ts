import { z } from 'zod';
import { Id } from './common.ts';

export const ProfileType = z
  .enum(['developer', 'designer', 'student', 'professional'])
  .meta({ id: 'ProfileType' });
export type ProfileType = z.infer<typeof ProfileType>;

export const SectionType = z
  .enum([
    'hero',
    'about',
    'experience',
    'projects',
    'skills',
    'education',
    'certifications',
    'awards',
    'writing',
    'testimonials',
    'gallery',
    'contact',
  ])
  .meta({ id: 'SectionType' });
export type SectionType = z.infer<typeof SectionType>;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ColorSet = z
  .object({
    background: Hex,
    surface: Hex,
    text: Hex,
    muted: Hex,
    primary: Hex,
    accent: Hex,
    border: Hex,
  })
  .meta({ id: 'ColorSet' });

export const ThemeTokens = z
  .object({
    colors: z.object({ light: ColorSet, dark: ColorSet }),
    fonts: z.object({
      heading: z.string().max(60),
      body: z.string().max(60),
      mono: z.string().max(60),
    }),
    scale: z.number().min(1.1).max(1.5),
    radius: z.number().min(0).max(32),
    density: z.enum(['compact', 'comfortable', 'roomy']),
    shadow: z.enum(['none', 'soft', 'strong']),
    motion: z.enum(['none', 'subtle', 'lively']),
    width: z.number().min(720).max(1440),
    colorMode: z.enum(['light', 'dark', 'auto']).meta({ id: 'ColorMode' }),
  })
  .meta({ id: 'ThemeTokens' });
export type ThemeTokens = z.infer<typeof ThemeTokens>;

export const SectionSpec = z
  .object({
    id: Id,
    type: SectionType,
    variant: z.string().max(40),
    visible: z.boolean().default(true),
    options: z.record(z.string(), z.unknown()).default({}),
    custom: z.boolean().default(false),
  })
  .meta({ id: 'SectionSpec' });

export const SeoSpec = z
  .object({
    title: z.string().max(70).default(''),
    description: z.string().max(170).default(''),
    url: z.string().max(2048).default(''),
    keywords: z.array(z.string().max(40)).default([]),
  })
  .meta({ id: 'SeoSpec' });

export const SiteSpec = z
  .object({
    theme: ThemeTokens,
    nav: z.object({ variant: z.string().max(40) }),
    sections: z.array(SectionSpec),
    pages: z.object({ caseStudies: z.boolean().default(false) }),
    seo: SeoSpec,
  })
  .meta({ id: 'SiteSpec' });
export type SiteSpec = z.infer<typeof SiteSpec>;

export const CustomCode = z
  .object({
    css: z.string().default(''),
    js: z.string().default(''),
    sections: z
      .record(
        z.string(),
        z
          .object({ html: z.string(), css: z.string().default(''), js: z.string().default('') })
          .meta({ id: 'CustomSection' }),
      )
      .default({}),
  })
  .meta({ id: 'CustomCode' });
export type CustomCode = z.infer<typeof CustomCode>;
