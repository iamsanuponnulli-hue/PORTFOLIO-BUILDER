import type { SectionType } from '@pb/schema';

export interface VariantInfo {
  id: string;
  label: string;
}

export interface SectionInfo {
  label: string;
  defaultTitle: string;
  variants: VariantInfo[];
}

/**
 * What each section type can look like. The renderer implements every variant
 * listed here; the editor's layout gallery and the AI read this list.
 */
export const SECTION_CATALOG: Record<SectionType, SectionInfo> = {
  hero: {
    label: 'Intro',
    defaultTitle: '',
    variants: [
      { id: 'split', label: 'Text and photo' },
      { id: 'centered', label: 'Centered' },
      { id: 'bigtype', label: 'Big type' },
      { id: 'terminal', label: 'Terminal' },
    ],
  },
  about: {
    label: 'About',
    defaultTitle: 'About',
    variants: [
      { id: 'text', label: 'Text' },
      { id: 'photo', label: 'Text and photo' },
    ],
  },
  experience: {
    label: 'Experience',
    defaultTitle: 'Experience',
    variants: [
      { id: 'timeline', label: 'Timeline' },
      { id: 'cards', label: 'Cards' },
      { id: 'compact', label: 'Compact list' },
    ],
  },
  projects: {
    label: 'Projects',
    defaultTitle: 'Projects',
    variants: [
      { id: 'grid', label: 'Card grid' },
      { id: 'featured', label: 'Featured + grid' },
      { id: 'list', label: 'List' },
    ],
  },
  skills: {
    label: 'Skills',
    defaultTitle: 'Skills',
    variants: [
      { id: 'tags', label: 'Tags' },
      { id: 'columns', label: 'Grouped columns' },
    ],
  },
  education: {
    label: 'Education',
    defaultTitle: 'Education',
    variants: [
      { id: 'list', label: 'List' },
      { id: 'cards', label: 'Cards' },
    ],
  },
  certifications: {
    label: 'Certifications',
    defaultTitle: 'Certifications',
    variants: [
      { id: 'list', label: 'List' },
      { id: 'cards', label: 'Cards' },
    ],
  },
  awards: {
    label: 'Awards',
    defaultTitle: 'Awards',
    variants: [
      { id: 'list', label: 'List' },
      { id: 'cards', label: 'Cards' },
    ],
  },
  writing: {
    label: 'Writing',
    defaultTitle: 'Writing',
    variants: [
      { id: 'list', label: 'List' },
      { id: 'cards', label: 'Cards' },
    ],
  },
  testimonials: {
    label: 'Testimonials',
    defaultTitle: 'Kind words',
    variants: [
      { id: 'grid', label: 'Quote grid' },
      { id: 'single', label: 'Large quotes' },
    ],
  },
  gallery: {
    label: 'Gallery',
    defaultTitle: 'Gallery',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'masonry', label: 'Masonry' },
    ],
  },
  contact: {
    label: 'Contact',
    defaultTitle: 'Contact',
    variants: [
      { id: 'simple', label: 'Links' },
      { id: 'cta', label: 'Call to action' },
      { id: 'form', label: 'Form' },
    ],
  },
};

export const NAV_VARIANTS: VariantInfo[] = [
  { id: 'top', label: 'Top bar' },
  { id: 'minimal', label: 'Minimal' },
];

export const hasVariant = (type: SectionType, variant: string) =>
  SECTION_CATALOG[type].variants.some((v) => v.id === variant);
