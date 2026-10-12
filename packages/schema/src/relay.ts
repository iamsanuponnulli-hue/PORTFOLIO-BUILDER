import { z } from 'zod';

/** Which allowance bucket a Starter request counts against. */
export const RelayKind = z.enum(['generation', 'edit']);

export const RelayMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

/**
 * Provider-neutral request the browser sends to aiRelay (Starter only).
 * Requests with the user's own key go directly to the provider and never use this.
 */
export const RelayRequest = z.object({
  kind: RelayKind,
  system: z.string().default(''),
  messages: z.array(RelayMessage).min(1),
  maxOutputTokens: z.number().int().min(1),
});
export type RelayRequest = z.infer<typeof RelayRequest>;
