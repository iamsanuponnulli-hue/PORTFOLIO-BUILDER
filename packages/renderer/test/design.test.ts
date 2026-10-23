import { Inspiration, ProfileType, SiteSpec } from '@pb/schema';
import { describe, expect, it } from 'vitest';
import { apply } from '../src/apply.ts';
import { codeEditOps, CodeError, parseSections } from '../src/code.ts';
import { colorsInText, contrast, ensureContrast } from '../src/color.ts';
import {
  briefFromStyles,
  closestFont,
  curatedDirections,
  readableTheme,
  specFromDraft,
  themeIsReadable,
} from '../src/design.ts';
import { describeChanges } from '../src/diff.ts';
import { previewDocument, render } from '../src/render.ts';
import { sampleState } from '../src/samples.ts';
import { PRESETS } from '../src/defaults.ts';

describe('colours', () => {
  it('fixes unreadable text while keeping readable colours as they are', () => {
    const fixed = ensureContrast('#bbbbbb', '#ffffff', 4.5);
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast('#111111', '#ffffff', 4.5)).toBe('#111111');
    expect(contrast(ensureContrast('#333333', '#101010', 4.5), '#101010')).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('reads colours from free text', () => {
    expect(colorsInText('navy and gold, maybe #FF6600')).toEqual(['#1e3a8a', '#a8820a', '#ff6600']);
  });

  it('makes any theme readable', () => {
    const t = structuredClone(PRESETS[0]!.theme);
    t.colors.light.text = '#eeeeee';
    t.colors.dark.muted = '#222222';
    expect(themeIsReadable(t)).toBe(false);
    expect(themeIsReadable(readableTheme(t))).toBe(true);
  });
});

describe('specFromDraft', () => {
  it('turns a messy model draft into a valid, readable spec', () => {
    const spec = specFromDraft(
      {
        name: 'Bold',
        description: '',
        preset: 'bold',
        colors: { light: { background: '#fff', text: '#eee', primary: 'not a colour' } },
        fonts: { heading: 'Helvetica Neue', body: 'Comic Sans' },
        radius: 99,
        density: 'huge',
        sections: [
          { type: 'hero', variant: 'nope' },
          { type: 'projects', variant: 'list', title: 'Work' },
          { type: 'spaceship' },
          { type: 'projects', variant: 'grid' },
          { type: 'contact' },
        ],
      },
      'developer',
    );
    expect(SiteSpec.safeParse(spec).success).toBe(true);
    expect(themeIsReadable(spec.theme)).toBe(true);
    expect(spec.theme.radius).toBe(32);
    expect(spec.theme.fonts.heading).toBe('Inter');
    expect(spec.sections.map((s) => s.id)).toEqual(['hero', 'projects', 'projects-2', 'contact']);
    expect(spec.sections[0]!.variant).toBe('terminal');
    expect(spec.sections[1]!.options['title']).toBe('Work');
  });

  it('keeps the profile layout when the draft has no intro section', () => {
    const spec = specFromDraft(
      { name: 'x', description: '', sections: [{ type: 'about' }] },
      'student',
    );
    expect(spec.sections[0]!.type).toBe('hero');
  });

  it('maps font names to the curated list', () => {
    expect(closestFont('"Playfair Display", serif', 'heading')).toBe('Playfair Display');
    expect(closestFont('Garamond', 'heading')).toBe('Fraunces');
    expect(closestFont('Roboto', 'body')).toBe('Inter');
    expect(closestFont('', 'body')).toBeUndefined();
  });
});

describe('curatedDirections', () => {
  for (const type of ProfileType.options) {
    it(`gives three distinct, valid designs for ${type}`, () => {
      const ds = curatedDirections(type, { tone: 'bold', colorMode: 'light' });
      expect(ds).toHaveLength(3);
      expect(new Set(ds.map((d) => d.name)).size).toBe(3);
      for (const d of ds) {
        expect(SiteSpec.safeParse(d.spec).success).toBe(true);
        expect(themeIsReadable(d.spec.theme)).toBe(true);
        expect(d.spec.theme.colorMode).toBe('light');
      }
      expect(ds[0]!.name).toBe('Bold');
    });
  }

  it('gives different designs for the next round', () => {
    const a = curatedDirections('designer', {}).map((d) => d.name);
    const b = curatedDirections('designer', {}, [], 1).map((d) => d.name);
    expect(a).not.toEqual(b);
  });

  it('uses colour wishes and inspiration', () => {
    const insp = Inspiration.parse({
      id: 'i1',
      source: 'extension',
      title: 'example.dev',
      brief: {
        palette: ['#0b0b0f', '#ff3366', '#f5f5f5'],
        background: 'dark',
        fonts: { heading: 'Playfair Display', body: 'Inter' },
        layout: ['split hero', 'timeline'],
        mood: ['elegant'],
      },
      borrow: { colors: true, fonts: true, layout: true, mood: true },
    });
    const [first] = curatedDirections('professional', { colorPreference: 'teal' }, [insp]);
    expect(first!.name).toContain('example.dev');
    expect(first!.spec.theme.fonts.heading).toBe('Playfair Display');
    expect(first!.spec.sections.find((s) => s.type === 'hero')!.variant).toBe('split');
    expect(themeIsReadable(first!.spec.theme)).toBe(true);
  });
});

describe('code mode', () => {
  const state = sampleState('developer');
  const html = render(state).files['index.html']!;

  it('finds every rendered section', () => {
    const ids = parseSections(html).regions.map((r) => r.id);
    expect(ids).toContain('hero');
    expect(ids).toContain('projects');
  });

  it('turns an edited section into a custom section', () => {
    const edited = html.replace('<section id="about"', '<section data-x="1" id="about"');
    const r = codeEditOps(html, edited, state);
    expect(r.converted).toEqual(['about']);
    const next = r.ops.reduce(apply, state);
    expect(next.spec.sections.find((s) => s.id === 'about')!.custom).toBe(true);
    expect(render(next).files['index.html']).toContain('data-x="1"');
  });

  it('reports no changes for an untouched file', () => {
    expect(codeEditOps(html, html, state).ops).toEqual([]);
  });

  it('rejects broken markers and edits outside sections', () => {
    expect(() => codeEditOps(html, html.replace('<!-- /pb:section -->', ''), state)).toThrow(
      CodeError,
    );
    expect(() => codeEditOps(html, html.replace('<title>', '<title>Hi '), state)).toThrow(
      /inside sections/,
    );
  });
});

describe('describeChanges', () => {
  it('lists design and content changes in plain words', () => {
    const a = sampleState('developer');
    let b = apply(a, { op: 'setVariant', id: 'projects', variant: 'list' });
    b = apply(b, { op: 'updateTheme', tokens: { radius: 0 } });
    b = apply(b, { op: 'updateContent', path: 'profile.headline', value: 'New' });
    b = apply(b, { op: 'toggleSection', id: 'about' });
    const lines = describeChanges(a, b);
    expect(lines).toContain('Projects layout: Card grid → List');
    expect(lines).toContain('Corner rounding: 8 → 0');
    expect(lines).toContain('Profile headline changed');
    expect(lines).toContain('Hid About');
    expect(describeChanges(a, a)).toEqual([]);
  });
});

describe('editor preview', () => {
  it('adds the editor script only when asked', () => {
    const files = render(sampleState('developer'), { mode: 'preview', editable: true }).files;
    const plain = previewDocument(files);
    const editor = previewDocument(files, 'index.html', { editor: true });
    expect(plain).not.toContain("pb:'select'");
    expect(editor).toContain("pb:'select'");
    expect(editor.indexOf('__PB_PREVIEW__')).toBeLessThan(editor.indexOf('<style>'));
    expect(editor.trimEnd().endsWith('</html>')).toBe(true);
  });
});

describe('custom sections', () => {
  it('adds a custom section with its own code', () => {
    const s = apply(sampleState('designer'), {
      op: 'addCustomSection',
      index: 1,
      title: 'Now',
      html: '<section id="custom" class="pb-section"><p>Hello</p></section>',
      css: '.x{}',
    });
    expect(s.spec.sections[1]).toMatchObject({ id: 'custom', type: 'custom', custom: true });
    const out = render(s);
    expect(out.files['index.html']).toContain('<p>Hello</p>');
    expect(out.files['assets/css/sections.css']).toContain('.x{}');
    expect(() => apply(s, { op: 'revertToManaged', id: 'custom' })).toThrow();
  });
});

describe('asset paths', () => {
  it('makes export image paths relative to each page', () => {
    const s = sampleState('designer');
    const id = s.content.projects[0]!.images[0]?.assetId ?? 'img1';
    const state = {
      ...s,
      spec: { ...s.spec, pages: { caseStudies: true } },
      content: {
        ...s.content,
        projects: s.content.projects.map((p, i) =>
          i === 0
            ? {
                ...p,
                images: [{ assetId: id, alt: 'Shot' }],
                caseStudy: p.caseStudy ?? {
                  problem: 'x',
                  role: '',
                  process: '',
                  outcome: '',
                  body: '',
                },
              }
            : p,
        ),
      },
    };
    const files = render(state, {
      mode: 'export',
      assets: { [id]: { src: 'assets/img/a.webp', srcset: 'assets/img/a-480.webp 480w' } },
    }).files;
    const page = Object.keys(files).find((f) => f.startsWith('projects/'))!;
    expect(files[page]).toContain('src="../assets/img/a.webp"');
    expect(files[page]).toContain('srcset="../assets/img/a-480.webp 480w"');
    expect(files['index.html']).toContain('src="assets/img/a.webp"');
  });
});

describe('briefFromStyles', () => {
  it('reads a brief from captured page styles', () => {
    const b = briefFromStyles({
      backgrounds: ['#0b0b0f'],
      colors: ['#f5f5f5', '#ff3366'],
      fonts: [
        { family: 'Inter', uses: 500 },
        { family: 'Fraunces', uses: 50, heading: true },
      ],
      radius: [12],
      structure: ['hero: with image, left aligned', 'h1 size: 72px', '3 card/grid groups'],
    });
    expect(b).toMatchObject({
      palette: ['#0b0b0f', '#f5f5f5', '#ff3366'],
      background: 'dark',
      fonts: { heading: 'Fraunces', body: 'Inter' },
      layout: ['split hero', 'big type', 'card grid'],
      density: 'roomy',
      radius: 12,
    });
  });
});

describe('direction names', () => {
  it('names gallery styles as styles, not as sites', () => {
    const gallery = (title: string) =>
      Inspiration.parse({
        id: title,
        source: 'gallery',
        title,
        brief: { palette: ['#111111', '#ff3366'], mood: ['bold'] },
        borrow: { colors: true, fonts: true, layout: true, mood: true },
      });
    const [same] = curatedDirections('developer', { tone: 'bold' }, [gallery('Bold')]);
    expect(same!.name).toBe('Bold');
    const [other] = curatedDirections('developer', { tone: 'bold' }, [gallery('Minimal')]);
    expect(other!.name).toBe('Bold · Minimal style');
  });
});
