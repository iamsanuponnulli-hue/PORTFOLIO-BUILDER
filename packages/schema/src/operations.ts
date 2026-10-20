import { z } from 'zod';
import { Id } from './common.ts';
import { SectionType, ThemeTokens } from './spec.ts';

// Patches list only the fields being changed: no defaults, so nothing else is overwritten.
const SeoPatch = z
  .object({
    title: z.string().max(70),
    description: z.string().max(170),
    url: z.string().max(2048),
    keywords: z.array(z.string().max(40)),
  })
  .partial();
const ContactFormPatch = z
  .object({
    service: z.enum(['none', 'formspree', 'web3forms', 'endpoint', 'link']),
    value: z.string().max(2048),
  })
  .partial();

/** Every change to a site is one of these: from panels, code mode, the assistant and fixes. */
export const Operation = z.discriminatedUnion('op', [
  z.object({ op: z.literal('updateContent'), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('addItem'), path: z.string(), item: z.unknown() }),
  z.object({ op: z.literal('removeItem'), path: z.string(), id: Id }),
  z.object({ op: z.literal('updateTheme'), tokens: ThemeTokens.partial() }),
  z.object({
    op: z.literal('addSection'),
    type: SectionType,
    variant: z.string(),
    index: z.number().int().min(0),
  }),
  z.object({ op: z.literal('removeSection'), id: Id }),
  z.object({ op: z.literal('toggleSection'), id: Id }),
  z.object({ op: z.literal('moveSection'), id: Id, index: z.number().int().min(0) }),
  z.object({ op: z.literal('setVariant'), id: Id, variant: z.string() }),
  z.object({
    op: z.literal('setSectionOptions'),
    id: Id,
    options: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('convertToCustom'),
    id: Id,
    html: z.string(),
    css: z.string().optional(),
    js: z.string().optional(),
  }),
  z.object({ op: z.literal('revertToManaged'), id: Id }),
  z.object({
    op: z.literal('addCustomSection'),
    index: z.number().int().min(0),
    title: z.string().max(80).optional(),
    html: z.string(),
    css: z.string().optional(),
    js: z.string().optional(),
  }),
  z.object({
    op: z.literal('editCustomCode'),
    file: z.enum(['custom.css', 'custom.js']),
    content: z.string(),
  }),
  z.object({ op: z.literal('setSeo'), seo: SeoPatch }),
  z.object({ op: z.literal('setNav'), variant: z.string().max(40) }),
  z.object({ op: z.literal('setPages'), pages: z.object({ caseStudies: z.boolean() }).partial() }),
  z.object({ op: z.literal('setContactForm'), contactForm: ContactFormPatch }),
]);
export type Operation = z.infer<typeof Operation>;
