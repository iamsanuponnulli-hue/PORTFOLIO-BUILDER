import { z } from 'zod';

export const ModelChoice = z
  .object({
    provider: z.string().max(40),
    model: z.string().max(120),
  })
  .meta({ id: 'ModelChoice' });

/**
 * Which models to use. Keys themselves never leave the user's device: the app has no
 * paid AI of its own, so every AI call uses the user's own (often free) provider key.
 */
export const AiSettings = z
  .object({
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
