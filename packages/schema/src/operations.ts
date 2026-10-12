import { z } from 'zod';
import { Id } from './common.ts';
import { SectionType, ThemeTokens } from './spec.ts';

/** Every change to a site is one of these. Expanded alongside the renderer in Phase 1. */
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
    op: z.literal('editCustomCode'),
    file: z.enum(['custom.css', 'custom.js']),
    content: z.string(),
  }),
]);
export type Operation = z.infer<typeof Operation>;
