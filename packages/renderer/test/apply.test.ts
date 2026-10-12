import { describe, expect, it } from 'vitest';
import { apply, applyAll, OperationError } from '../src/apply.ts';
import { sampleState } from '../src/samples.ts';

const base = () => sampleState('developer');

describe('apply', () => {
  it('updates content by path', () => {
    const s = apply(base(), { op: 'updateContent', path: 'projects.p2.title', value: 'Railmap' });
    expect(s.content.projects[1]!.title).toBe('Railmap');
  });

  it('adds and removes list items', () => {
    const item = {
      id: 'p9',
      title: 'New',
      summary: '',
      role: '',
      tech: [],
      links: [],
      images: [],
      tags: [],
      featured: false,
    };
    let s = apply(base(), { op: 'addItem', path: 'projects', item });
    expect(s.content.projects.at(-1)!.id).toBe('p9');
    s = apply(s, { op: 'removeItem', path: 'projects', id: 'p9' });
    expect(s.content.projects.some((p) => p.id === 'p9')).toBe(false);
    expect(() => apply(s, { op: 'removeItem', path: 'projects', id: 'p9' })).toThrow(
      OperationError,
    );
  });

  it('merges theme changes, including one colour', () => {
    const s = apply(base(), {
      op: 'updateTheme',
      tokens: { radius: 20, colors: { light: { primary: '#123456' } } as never },
    });
    expect(s.spec.theme.radius).toBe(20);
    expect(s.spec.theme.colors.light.primary).toBe('#123456');
    expect(s.spec.theme.colors.light.background).toBe(base().spec.theme.colors.light.background);
  });

  it('adds sections with unique ids and checks the layout exists', () => {
    let s = apply(base(), { op: 'addSection', type: 'testimonials', variant: 'grid', index: 2 });
    expect(s.spec.sections[2]!.id).toBe('testimonials');
    s = apply(s, { op: 'addSection', type: 'testimonials', variant: 'single', index: 99 });
    expect(s.spec.sections.at(-1)!.id).toBe('testimonials-2');
    expect(() => apply(s, { op: 'addSection', type: 'hero', variant: 'nope', index: 0 })).toThrow(
      OperationError,
    );
  });

  it('moves, hides, re-styles and configures sections', () => {
    const s = applyAll(base(), [
      { op: 'moveSection', id: 'contact', index: 1 },
      { op: 'toggleSection', id: 'writing' },
      { op: 'setVariant', id: 'projects', variant: 'list' },
      { op: 'setSectionOptions', id: 'projects', options: { title: 'Things I built' } },
    ]);
    expect(s.spec.sections[1]!.id).toBe('contact');
    expect(s.spec.sections.find((x) => x.id === 'writing')!.visible).toBe(false);
    const p = s.spec.sections.find((x) => x.id === 'projects')!;
    expect(p.variant).toBe('list');
    expect(p.options).toEqual({ filter: true, title: 'Things I built' });
  });

  it('converts a section to custom code and back', () => {
    let s = apply(base(), {
      op: 'convertToCustom',
      id: 'about',
      html: '<section id="about">Hi</section>',
    });
    expect(s.spec.sections.find((x) => x.id === 'about')!.custom).toBe(true);
    expect(s.custom.sections['about']!.html).toContain('Hi');
    s = apply(s, { op: 'revertToManaged', id: 'about' });
    expect(s.custom.sections['about']).toBeUndefined();
  });

  it('never mutates its input', () => {
    const s0 = base();
    const snapshot = JSON.stringify(s0);
    applyAll(s0, [
      { op: 'updateContent', path: 'profile.name', value: 'X' },
      { op: 'removeSection', id: 'about' },
      { op: 'setSeo', seo: { title: 'T' } },
      { op: 'setContactForm', contactForm: { service: 'formspree', value: 'abc' } },
    ]);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('patches SEO and contact settings without touching other fields', () => {
    const s = applyAll(base(), [
      { op: 'setSeo', seo: { title: 'Jane' } },
      { op: 'setContactForm', contactForm: { service: 'formspree' } },
      { op: 'setContactForm', contactForm: { value: 'xyz' } },
    ]);
    expect(s.spec.seo).toEqual({ ...base().spec.seo, title: 'Jane' });
    expect(s.contactForm).toEqual({ service: 'formspree', value: 'xyz' });
  });
});
