import { z } from 'zod';
import { DateText, Id } from './common.ts';

export const Link = z
  .object({
    label: z.string().max(80),
    url: z.string().max(2048),
  })
  .meta({ id: 'Link' });

export const ImageRef = z
  .object({
    assetId: Id,
    alt: z.string().max(300).default(''),
  })
  .meta({ id: 'ImageRef' });

export const Profile = z
  .object({
    name: z.string().max(120).default(''),
    headline: z.string().max(160).default(''),
    tagline: z.string().max(240).default(''),
    bio: z.string().max(4000).default(''),
    location: z.string().max(120).default(''),
    email: z.string().max(254).default(''),
    photo: ImageRef.nullish(),
    socials: z.array(Link).default([]),
  })
  .meta({ id: 'Profile' });

export const Experience = z
  .object({
    id: Id,
    company: z.string().max(160),
    role: z.string().max(160),
    start: DateText.default(''),
    end: DateText.default(''),
    location: z.string().max(120).default(''),
    bullets: z.array(z.string().max(600)).default([]),
    tech: z.array(z.string().max(60)).default([]),
  })
  .meta({ id: 'ExperienceItem' });

export const CaseStudy = z
  .object({
    problem: z.string().max(4000).default(''),
    role: z.string().max(2000).default(''),
    process: z.string().max(8000).default(''),
    outcome: z.string().max(4000).default(''),
    body: z.string().max(20000).default(''),
  })
  .meta({ id: 'CaseStudy' });

export const Project = z
  .object({
    id: Id,
    title: z.string().max(160),
    summary: z.string().max(1000).default(''),
    role: z.string().max(160).default(''),
    tech: z.array(z.string().max(60)).default([]),
    links: z.array(Link).default([]),
    images: z.array(ImageRef).default([]),
    tags: z.array(z.string().max(40)).default([]),
    featured: z.boolean().default(false),
    caseStudy: CaseStudy.nullish(),
  })
  .meta({ id: 'ProjectItem' });

export const SkillGroup = z
  .object({
    group: z.string().max(80),
    items: z.array(z.string().max(60)).default([]),
  })
  .meta({ id: 'SkillGroup' });

export const Education = z
  .object({
    id: Id,
    institution: z.string().max(160),
    degree: z.string().max(160).default(''),
    start: DateText.default(''),
    end: DateText.default(''),
    details: z.array(z.string().max(400)).default([]),
  })
  .meta({ id: 'EducationItem' });

export const SimpleItem = z
  .object({
    id: Id,
    title: z.string().max(200),
    issuer: z.string().max(160).default(''),
    date: DateText.default(''),
    url: z.string().max(2048).default(''),
    description: z.string().max(1000).default(''),
  })
  .meta({ id: 'SimpleItem' });

export const Testimonial = z
  .object({
    id: Id,
    quote: z.string().max(1500),
    author: z.string().max(120),
    role: z.string().max(160).default(''),
  })
  .meta({ id: 'Testimonial' });

export const PortfolioContent = z
  .object({
    profile: Profile.default(Profile.parse({})),
    experience: z.array(Experience).default([]),
    projects: z.array(Project).default([]),
    skills: z.array(SkillGroup).default([]),
    education: z.array(Education).default([]),
    certifications: z.array(SimpleItem).default([]),
    awards: z.array(SimpleItem).default([]),
    writing: z.array(SimpleItem).default([]),
    testimonials: z.array(Testimonial).default([]),
  })
  .meta({ id: 'PortfolioContent' });

export type PortfolioContent = z.infer<typeof PortfolioContent>;
