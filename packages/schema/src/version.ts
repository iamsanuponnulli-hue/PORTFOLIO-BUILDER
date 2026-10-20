import { z } from 'zod';

export const VersionSource = z
  .enum(['generate', 'manual', 'assistant', 'regenerate', 'import', 'restore'])
  .meta({ id: 'VersionSource' });

/**
 * projects/{pid}/versions/{vid}: an immutable snapshot. The snapshot is stored as a
 * JSON string so Firestore doesn't index every field (and it stays under 1 MiB).
 */
export const VersionDoc = z
  .object({
    createdAt: z.number().int(),
    source: VersionSource,
    summary: z.string().max(500).default(''),
    prompt: z.string().max(2000).default(''),
    /** JSON of {content, spec, custom, contactForm}. */
    snapshot: z.string().max(900_000),
  })
  .meta({ id: 'VersionDoc' });
export type VersionDoc = z.infer<typeof VersionDoc>;
