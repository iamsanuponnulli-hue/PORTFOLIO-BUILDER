import { describe, expect, it } from 'vitest';
import type { ProfileType } from '@pb/schema';
import { apply } from '../src/apply.ts';
import { SECTION_CATALOG } from '../src/catalog.ts';
import { checkSite, exportReady } from '../src/checks.ts';
import { contrast } from '../src/color.ts';
import { PRESETS } from '../src/defaults.ts';
import { previewDocument, render } from '../src/render.ts';
import { sampleState } from '../src/samples.ts';

const TYPES: ProfileType[] = ['developer', 'designer', 'student', 'professional'];
const now = new Date('2026-10-12T00:00:00Z');

describe('render', () => {
  it('is deterministic', () => {
    const a = render(sampleState('developer'), { mode: 'export', now });
    const b = render(sampleState('developer'), { mode: 'export', now });
    expect(a).toEqual(b);
  });

  it.each(TYPES)('renders the %s sample with every visible section and no errors', (t) => {
    const state = sampleState(t);
    const { files, checks } = render(state, { mode: 'export', now });
    const html = files['index.html']!;
    expect(html).toContain(state.content.profile.name);
    for (const s of state.spec.sections) expect(html).toContain(`<!-- pb:section id="${s.id}" -->`);
    expect(checks.filter((c) => c.severity === 'error')).toEqual([]);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'index.html',
        'assets/css/theme.css',
        'assets/css/base.css',
        'assets/css/sections.css',
        'assets/js/main.js',
        'robots.txt',
      ]),
    );
  });

  it('renders every layout of every section type', () => {
    for (const t of TYPES) {
      for (const [type, info] of Object.entries(SECTION_CATALOG)) {
        for (const v of info.variants) {
          let s = sampleState(t);
          s = s.spec.sections.some((x) => x.type === type)
            ? apply(s, {
                op: 'setVariant',
                id: s.spec.sections.find((x) => x.type === type)!.id,
                variant: v.id,
              })
            : apply(s, { op: 'addSection', type: type as never, variant: v.id, index: 1 });
          expect(() => render(s, { mode: 'preview', editable: true, now })).not.toThrow();
        }
      }
    }
  });

  it('escapes user content everywhere', () => {
    const evil = '<script>alert(1)</script>';
    let s = sampleState('developer');
    s = apply(s, { op: 'updateContent', path: 'profile.name', value: evil });
    s = apply(s, { op: 'updateContent', path: 'projects.p1.title', value: evil });
    s = apply(s, {
      op: 'updateContent',
      path: 'projects.p1.links.0.url',
      value: 'javascript:alert(1)',
    });
    s = apply(s, { op: 'setSectionOptions', id: 'projects', options: { title: evil } });
    const html = render(s, { mode: 'export', now }).files['index.html']!;
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('javascript:');
    // The JSON-LD block also stays closed.
    expect(html).not.toMatch(/application\/ld\+json">[^<]*<script/);
  });

  it('leaves empty sections out of exports but explains them in the preview', () => {
    const s = apply(sampleState('developer'), {
      op: 'addSection',
      type: 'testimonials',
      variant: 'grid',
      index: 1,
    });
    expect(render(s, { mode: 'export', now }).files['index.html']).not.toContain(
      'pb:section id="testimonials"',
    );
    const preview = render(s, { mode: 'preview', now }).files['index.html']!;
    expect(preview).toContain('pb:section id="testimonials"');
    expect(preview).toContain('pb-empty');
  });

  it('shows a photo placeholder in the preview but not in exports', () => {
    const s = sampleState('professional');
    expect(render(s, { mode: 'preview', now }).files['index.html']).toContain('pb-hero-photo');
    const exported = render(s, { mode: 'export', now }).files['index.html']!;
    expect(exported).not.toContain('pb-hero-photo');
    expect(exported).not.toContain('pb-about-photo');
  });

  it('adds inline-edit markers only in editable previews', () => {
    const s = sampleState('developer');
    expect(render(s, { mode: 'preview', editable: true, now }).files['index.html']).toContain(
      'data-pb-edit="content:profile.name"',
    );
    expect(render(s, { mode: 'export', now }).files['index.html']).not.toContain('data-pb-edit');
  });

  it('builds case-study pages with unique names', () => {
    const { files } = render(sampleState('designer'), { mode: 'export', now });
    expect(files['projects/glucose-diary-redesign.html']).toContain('The problem');
    expect(files['index.html']).toContain('href="projects/glucose-diary-redesign.html"');
    expect(files['projects/glucose-diary-redesign.html']).toContain(
      'href="../assets/css/theme.css"',
    );
  });

  it('writes sitemap and canonical links only with an https site address', () => {
    let s = sampleState('developer');
    expect(render(s, { mode: 'export', now }).files['sitemap.xml']).toBeUndefined();
    s = apply(s, { op: 'setSeo', seo: { url: 'https://jane.dev/' } });
    const { files } = render(s, { mode: 'export', now });
    expect(files['sitemap.xml']).toContain('<loc>https://jane.dev/</loc>');
    expect(files['index.html']).toContain('<link rel="canonical" href="https://jane.dev/">');
  });

  it('uses the selected contact form service', () => {
    let s = apply(sampleState('developer'), { op: 'setVariant', id: 'contact', variant: 'form' });
    s = apply(s, {
      op: 'setContactForm',
      contactForm: { service: 'formspree', value: 'f/xyzabc' },
    });
    const { files } = render(s, { mode: 'export', now });
    expect(files['index.html']).toContain('action="https://formspree.io/f/xyzabc"');
    expect(files['index.html']).toContain('name="_gotcha"');
    expect(files['assets/js/main.js']).toContain('form[data-pb-form]');
  });

  it('only ships the scripts the site uses', () => {
    const mono = apply(sampleState('student'), {
      op: 'updateTheme',
      tokens: { motion: 'none', colorMode: 'light' },
    });
    const js = render(mono, { mode: 'export', now }).files['assets/js/main.js']!;
    expect(js).not.toContain('IntersectionObserver');
    expect(js).not.toContain('pb-theme');
  });

  it('self-hosts fonts in export mode', () => {
    const css = render(sampleState('developer'), { mode: 'export', fontSource: 'self-hosted', now })
      .files['assets/css/theme.css']!;
    expect(css).toContain('url("../fonts/space-grotesk-700.woff2")');
  });

  it('inlines CSS and JS for the preview iframe', () => {
    const { files } = render(sampleState('developer'), { mode: 'preview', now });
    const doc = previewDocument(files);
    expect(doc).not.toContain('href="assets/css');
    expect(doc).toContain('window.__PB_PREVIEW__=true');
    expect(doc).toContain('--pb-primary');
  });
});

describe('presets and checks', () => {
  it.each(PRESETS.map((p) => p.id))('preset %s passes all contrast checks in both modes', (id) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    for (const mode of ['light', 'dark'] as const) {
      const c = preset.theme.colors[mode];
      expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.text, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.muted, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.primary, c.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('flags unreadable colours, placeholders and missing contact', () => {
    let s = sampleState('developer');
    s = apply(s, {
      op: 'updateTheme',
      tokens: { colorMode: 'light', colors: { light: { text: '#cccccc' } } as never },
    });
    s = apply(s, {
      op: 'updateContent',
      path: 'experience.e1.bullets.0',
      value: 'Grew revenue by [X%].',
    });
    s = apply(s, { op: 'updateContent', path: 'profile.email', value: '' });
    s = apply(s, { op: 'updateContent', path: 'profile.socials', value: [] });
    const checks = checkSite(s);
    const ids = checks.map((c) => c.id);
    expect(ids).toContain('contrast-text-light');
    expect(ids).toContain('placeholder-experience.e1.bullets.0');
    expect(ids).toContain('no-contact');
    expect(exportReady(checks)).toBe(false);
  });

  it('flags a malformed form ID', () => {
    const s = apply(sampleState('developer'), {
      op: 'setContactForm',
      contactForm: { service: 'formspree', value: 'not valid!' },
    });
    expect(checkSite(s).map((c) => c.id)).toContain('form-config');
  });
});
