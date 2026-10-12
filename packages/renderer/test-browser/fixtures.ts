import type { SectionType } from '@pb/schema';
import { SECTION_CATALOG } from '../src/catalog.ts';
import { PRESETS } from '../src/defaults.ts';
import { SAMPLE_CONTENT, sampleState } from '../src/samples.ts';
import type { AssetInfo, SiteState } from '../src/types.ts';

const svg = (w: number, h: number, a: string, b: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );

/** Fake uploaded images, to exercise the <img> paths (not just placeholders). */
export const ASSETS: Record<string, AssetInfo> = {
  photo: { src: svg(800, 1000, '#667', '#bba'), width: 800, height: 1000 },
  shot1: { src: svg(1600, 1000, '#246', '#8ac'), width: 1600, height: 1000 },
  shot2: { src: svg(1200, 1600, '#642', '#ec9'), width: 1200, height: 1600 },
};

/** One page with all 12 section types and content for each, from the four samples. */
export function kitchenSink(
  variantIndex: number,
  presetId: string,
  withImages: boolean,
): SiteState {
  const d = SAMPLE_CONTENT;
  const content = {
    ...d.developer,
    profile: withImages
      ? { ...d.developer.profile, photo: { assetId: 'photo', alt: 'Portrait of Jane Doe' } }
      : d.developer.profile,
    projects: d.developer.projects.map((p, i) =>
      withImages
        ? {
            ...p,
            images: [{ assetId: i % 2 ? 'shot2' : 'shot1', alt: `Screenshot of ${p.title}` }],
          }
        : p,
    ),
    education: d.student.education,
    awards: d.student.awards,
    certifications: d.professional.certifications,
    testimonials: [...d.designer.testimonials, ...d.professional.testimonials],
  };
  const base = sampleState('developer', presetId);
  const types = Object.keys(SECTION_CATALOG) as SectionType[];
  const sections = types.map((type) => {
    const vs = SECTION_CATALOG[type].variants;
    return {
      id: type,
      type,
      variant: vs[variantIndex % vs.length]!.id,
      visible: true,
      options: type === 'projects' ? { filter: true } : {},
      custom: false,
    };
  });
  return {
    ...base,
    content,
    spec: { ...base.spec, sections, pages: { caseStudies: true } },
    contactForm: { service: 'formspree', value: 'xyzabc' },
  };
}

export const PRESET_IDS = PRESETS.map((p) => p.id);
