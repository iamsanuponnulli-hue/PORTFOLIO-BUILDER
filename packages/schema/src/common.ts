import { z } from 'zod';

export const Id = z.string().min(1).max(128);
export const IsoDateTime = z.iso.datetime();
/** Year-month like "2026-10" or "present"-style free text for resumes. */
export const DateText = z.string().max(40);
export const Url = z.url();
