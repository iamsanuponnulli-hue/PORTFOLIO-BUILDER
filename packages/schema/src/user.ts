import { z } from 'zod';

export const ModelChoice = z
  .object({
    provider: z.string().max(40),
    model: z.string().max(120),
  })
  .meta({ id: 'ModelChoice' });

export const AiSettings = z
  .object({
    mode: z.enum(['starter', 'own']).default('starter'),
    simple: z.boolean().default(true),
    smart: ModelChoice.nullish(),
    fast: ModelChoice.nullish(),
  })
  .meta({ id: 'AiSettings' });

/** users/{uid} — API keys are never stored here; they live only on the user's device. */
export const UserDoc = z
  .object({
    displayName: z.string().max(120).default(''),
    email: z.string().max(254).default(''),
    ai: AiSettings.default(AiSettings.parse({})),
    projectCount: z.number().int().min(0).default(0),
    createdAt: z.number().int(),
  })
  .meta({ id: 'UserDoc' });
export type UserDoc = z.infer<typeof UserDoc>;

/** usage/{uid} — written only by the aiRelay function. */
export const UsageDoc = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    generations: z.number().int().min(0),
    edits: z.number().int().min(0),
  })
  .meta({ id: 'UsageDoc' });
export type UsageDoc = z.infer<typeof UsageDoc>;
