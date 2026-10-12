import type { SectionType } from '@pb/schema';
import { about } from './about.ts';
import { contact } from './contact.ts';
import { experience } from './experience.ts';
import { gallery } from './gallery.ts';
import { hero } from './hero.ts';
import { awards, certifications, education, writing } from './lists.ts';
import { projects } from './projects.ts';
import type { SectionRenderer } from './shared.ts';
import { skills } from './skills.ts';
import { testimonials } from './testimonials.ts';

export const SECTIONS: Record<SectionType, SectionRenderer> = {
  hero,
  about,
  experience,
  projects,
  skills,
  education,
  certifications,
  awards,
  writing,
  testimonials,
  gallery,
  contact,
};
