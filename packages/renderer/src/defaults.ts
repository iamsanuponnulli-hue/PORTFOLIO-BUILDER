import type { ProfileType, SiteSpec, ThemeTokens } from '@pb/schema';

export interface Preset {
  id: string;
  label: string;
  theme: ThemeTokens;
}

const preset = (id: string, label: string, theme: ThemeTokens): Preset => ({ id, label, theme });

/** Starting themes. Every preset passes the contrast checks in both modes (tested). */
export const PRESETS: Preset[] = [
  preset('calm', 'Calm', {
    colors: {
      light: {
        background: '#f7f9f9',
        surface: '#ffffff',
        text: '#14201f',
        muted: '#52605f',
        primary: '#0f6e74',
        accent: '#b8651b',
        border: '#dde4e4',
      },
      dark: {
        background: '#0f1716',
        surface: '#162120',
        text: '#e6eeee',
        muted: '#9fb0ae',
        primary: '#5cc3c6',
        accent: '#f0a35e',
        border: '#26302f',
      },
    },
    fonts: { heading: 'Manrope', body: 'Inter', mono: 'IBM Plex Mono' },
    scale: 1.25,
    radius: 12,
    density: 'comfortable',
    shadow: 'soft',
    motion: 'subtle',
    width: 1120,
    colorMode: 'auto',
  }),
  preset('bold', 'Bold', {
    colors: {
      light: {
        background: '#ffffff',
        surface: '#f5f5f4',
        text: '#0a0a0a',
        muted: '#57534e',
        primary: '#c2410c',
        accent: '#1d4ed8',
        border: '#e7e5e4',
      },
      dark: {
        background: '#0a0a0a',
        surface: '#171717',
        text: '#fafafa',
        muted: '#a8a29e',
        primary: '#fb923c',
        accent: '#93c5fd',
        border: '#292524',
      },
    },
    fonts: { heading: 'Syne', body: 'Work Sans', mono: 'JetBrains Mono' },
    scale: 1.333,
    radius: 4,
    density: 'roomy',
    shadow: 'none',
    motion: 'lively',
    width: 1240,
    colorMode: 'auto',
  }),
  preset('editorial', 'Editorial', {
    colors: {
      light: {
        background: '#fbfaf7',
        surface: '#ffffff',
        text: '#1c1917',
        muted: '#5f5a54',
        primary: '#9a3412',
        accent: '#a16207',
        border: '#e7e2d9',
      },
      dark: {
        background: '#1a1714',
        surface: '#23201c',
        text: '#f3efe8',
        muted: '#b2aa9e',
        primary: '#f0a78a',
        accent: '#f5c27a',
        border: '#36302a',
      },
    },
    fonts: { heading: 'Fraunces', body: 'Source Serif 4', mono: 'IBM Plex Mono' },
    scale: 1.3,
    radius: 2,
    density: 'roomy',
    shadow: 'none',
    motion: 'subtle',
    width: 1080,
    colorMode: 'light',
  }),
  preset('technical', 'Technical', {
    colors: {
      light: {
        background: '#f6f8fa',
        surface: '#ffffff',
        text: '#1f2328',
        muted: '#59636e',
        primary: '#0969da',
        accent: '#8250df',
        border: '#d1d9e0',
      },
      dark: {
        background: '#0d1117',
        surface: '#151b23',
        text: '#e6edf3',
        muted: '#9198a1',
        primary: '#4493f8',
        accent: '#ab7df8',
        border: '#2a313c',
      },
    },
    fonts: { heading: 'Space Grotesk', body: 'IBM Plex Sans', mono: 'JetBrains Mono' },
    scale: 1.25,
    radius: 8,
    density: 'comfortable',
    shadow: 'soft',
    motion: 'subtle',
    width: 1160,
    colorMode: 'dark',
  }),
  preset('warm', 'Warm', {
    colors: {
      light: {
        background: '#fff8f1',
        surface: '#ffffff',
        text: '#2a1d14',
        muted: '#6b5a4c',
        primary: '#a8401c',
        accent: '#2f7d6d',
        border: '#f0e2d3',
      },
      dark: {
        background: '#1c1410',
        surface: '#261b15',
        text: '#f8ece1',
        muted: '#c2ad9b',
        primary: '#f08b62',
        accent: '#6fc7b2',
        border: '#3a2b22',
      },
    },
    fonts: { heading: 'Outfit', body: 'DM Sans', mono: 'IBM Plex Mono' },
    scale: 1.25,
    radius: 16,
    density: 'comfortable',
    shadow: 'soft',
    motion: 'subtle',
    width: 1120,
    colorMode: 'auto',
  }),
  preset('mono', 'Mono', {
    colors: {
      light: {
        background: '#ffffff',
        surface: '#fafafa',
        text: '#111111',
        muted: '#595959',
        primary: '#111111',
        accent: '#6b6b6b',
        border: '#e5e5e5',
      },
      dark: {
        background: '#111111',
        surface: '#1a1a1a',
        text: '#f2f2f2',
        muted: '#a3a3a3',
        primary: '#f2f2f2',
        accent: '#a3a3a3',
        border: '#2b2b2b',
      },
    },
    fonts: { heading: 'Inter', body: 'Inter', mono: 'IBM Plex Mono' },
    scale: 1.2,
    radius: 6,
    density: 'compact',
    shadow: 'none',
    motion: 'none',
    width: 1000,
    colorMode: 'auto',
  }),
];

export const findPreset = (id: string) => PRESETS.find((p) => p.id === id);

type SectionSeed = [
  type: SiteSpec['sections'][number]['type'],
  variant: string,
  options?: Record<string, unknown>,
];

const LAYOUTS: Record<
  ProfileType,
  { preset: string; nav: string; caseStudies: boolean; sections: SectionSeed[] }
> = {
  developer: {
    preset: 'technical',
    nav: 'top',
    caseStudies: false,
    sections: [
      ['hero', 'terminal'],
      ['about', 'text'],
      ['projects', 'grid', { filter: true }],
      ['experience', 'timeline'],
      ['skills', 'tags'],
      ['writing', 'list'],
      ['contact', 'simple'],
    ],
  },
  designer: {
    preset: 'editorial',
    nav: 'top',
    caseStudies: true,
    sections: [
      ['hero', 'bigtype'],
      ['projects', 'featured', { title: 'Selected work' }],
      ['about', 'photo'],
      ['experience', 'compact'],
      ['testimonials', 'single'],
      ['contact', 'cta'],
    ],
  },
  student: {
    preset: 'calm',
    nav: 'top',
    caseStudies: false,
    sections: [
      ['hero', 'centered'],
      ['about', 'text'],
      ['education', 'cards'],
      ['projects', 'grid'],
      ['skills', 'columns'],
      ['experience', 'cards', { title: 'Experience & internships' }],
      ['awards', 'list'],
      ['contact', 'simple'],
    ],
  },
  professional: {
    preset: 'warm',
    nav: 'top',
    caseStudies: false,
    sections: [
      ['hero', 'split'],
      ['about', 'photo'],
      ['experience', 'timeline'],
      ['skills', 'columns', { title: 'Skills & strengths' }],
      ['testimonials', 'grid'],
      ['certifications', 'list'],
      ['contact', 'cta'],
    ],
  },
};

/** The built-in theme a profile type starts with. */
export const profilePreset = (profileType: ProfileType) => LAYOUTS[profileType].preset;

/** A complete starting design for a profile type, optionally with another preset's theme. */
export function defaultSpec(profileType: ProfileType, presetId?: string): SiteSpec {
  const layout = LAYOUTS[profileType];
  const theme = (findPreset(presetId ?? layout.preset) ?? PRESETS[0]!).theme;
  return {
    theme: structuredClone(theme),
    nav: { variant: layout.nav },
    sections: layout.sections.map(([type, variant, options]) => ({
      id: type,
      type,
      variant,
      visible: true,
      options: { ...(options ?? {}) },
      custom: false,
    })),
    pages: { caseStudies: layout.caseStudies },
    seo: { title: '', description: '', url: '', keywords: [] },
  };
}
