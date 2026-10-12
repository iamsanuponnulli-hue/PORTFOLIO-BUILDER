import { z } from 'zod';
import { LIMITS } from './limits.ts';
import { PortfolioContent } from './content.ts';
import { CustomCode, ProfileType, SiteSpec } from './spec.ts';

export const ProjectStatus = z
  .enum(['draft', 'generating', 'choosing', 'editing', 'exported'])
  .meta({ id: 'ProjectStatus' });

export const Goals = z
  .object({
    purpose: z.enum(['job', 'freelance', 'academic', 'personal']).default('job'),
    targetRole: z.string().max(160).default(''),
    tone: z.enum(['minimal', 'bold', 'playful', 'elegant', 'technical']).default('minimal'),
    colorPreference: z.string().max(200).default(''),
    colorMode: z.enum(['light', 'dark', 'auto']).default('auto'),
    notes: z.string().max(2000).default(''),
  })
  .meta({ id: 'Goals' });

export const ContactForm = z
  .object({
    service: z.enum(['none', 'formspree', 'web3forms', 'endpoint', 'link']).default('none'),
    value: z.string().max(2048).default(''),
  })
  .meta({ id: 'ContactForm' });

export const ProjectDoc = z
  .object({
    ownerId: z.string().min(1),
    name: z.string().min(1).max(LIMITS.maxProjectNameLength),
    profileType: ProfileType,
    status: ProjectStatus,
    goals: Goals.default(Goals.parse({})),
    content: PortfolioContent.default(PortfolioContent.parse({})),
    spec: SiteSpec.nullish(),
    custom: CustomCode.default(CustomCode.parse({})),
    contactForm: ContactForm.default(ContactForm.parse({})),
    currentVersionId: z.string().nullish(),
    revision: z.number().int().min(0).default(0),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .meta({ id: 'ProjectDoc' });
export type ProjectDoc = z.infer<typeof ProjectDoc>;
