import { describe, expect, it } from 'vitest';
import {
  analyzeInspiration,
  assistantEdit,
  checkOperations,
  customSection,
  designDirections,
  metaDescription,
  rewriteItems,
  suggestTaglines,
  toBrief,
  writeCaseStudy,
} from '../src/index.ts';
import { fakeModel } from './helpers.ts';

describe('inspiration.analyze', () => {
  it('cleans the brief: valid colours, clamped sizes, trimmed lists', async () => {
    const r = await analyzeInspiration(
      fakeModel([
        JSON.stringify({
          palette: ['#FFF', 'red', '#123456', '#123456'],
          background: 'dark',
          fonts: { heading: 'Fraunces', body: 'Inter' },
          layout: ['split hero', ' '],
          mood: ['Calm'],
          density: 'roomy',
          radius: 99,
        }),
      ]),
      'Fake',
      { styles: { colors: ['#ffffff'] } },
      false,
    );
    expect(r.value).toMatchObject({
      palette: ['#ffffff', '#123456'],
      background: 'dark',
      layout: ['split hero'],
      mood: ['calm'],
      radius: 32,
    });
  });

  it('fills defaults for a sparse answer', () => {
    expect(toBrief({}).density).toBe('comfortable');
  });
});

describe('design.directions', () => {
  it('returns up to three forgiving drafts', async () => {
    const r = await designDirections(
      fakeModel([
        JSON.stringify({
          directions: [
            { name: 'Calm', description: 'Soft', preset: 'calm', radius: 'big' },
            { name: 'Bold', sections: [{ type: 'hero', variant: 'bigtype' }] },
            { name: 'Warm' },
            { name: 'Extra' },
          ],
        }),
      ]),
      'Fake',
      { profileType: 'developer', goals: {}, contentSummary: '', briefs: [], catalog: '' },
    );
    expect(r.value.map((d) => d.name)).toEqual(['Calm', 'Bold', 'Warm']);
    expect(r.value[0]!.radius).toBeUndefined();
  });
});

describe('assistant.edit', () => {
  it('keeps valid operations, reports invalid ones and flags content changes', async () => {
    const r = await assistantEdit(
      fakeModel([
        JSON.stringify({
          summary: 'Warmer colours and testimonials under projects.',
          operations: [
            { op: 'updateTheme', tokens: { radius: 16 } },
            { op: 'addSection', type: 'testimonials', variant: 'grid', index: 3 },
            { op: 'teleport' },
            { op: 'updateContent', path: 'profile.tagline', value: 'Hi' },
          ],
        }),
      ]),
      'Fake',
      { prompt: 'make it warmer', spec: {}, content: '', catalog: '' },
    );
    expect(r.value.operations).toHaveLength(3);
    expect(r.value.rejected).toHaveLength(1);
    expect(r.value.contentChanges).toEqual([2]);
    expect(r.value.summary).toContain('testimonials');
  });

  it('caps the number of operations', () => {
    const many = Array.from({ length: 60 }, () => ({ op: 'toggleSection', id: 'about' }));
    expect(checkOperations(many).operations).toHaveLength(40);
  });

  it('writes a custom section', async () => {
    const r = await customSection(
      fakeModel([JSON.stringify({ html: '<section id="custom">Hi</section>', css: '#custom{}' })]),
      'Fake',
      { prompt: 'a now section', theme: {}, content: '' },
    );
    expect(r.value).toMatchObject({ title: '', js: '', css: '#custom{}' });
  });
});

describe('content assistant', () => {
  it('rewrites one item per input and keeps originals for missing ones', async () => {
    const r = await rewriteItems(
      fakeModel([JSON.stringify({ items: ['Led the [X%] rewrite'] })]),
      'Fake',
      {
        context: 'bullets',
        items: ['did rewrite', 'helped team'],
      },
    );
    expect(r.value).toEqual(['Led the [X%] rewrite', 'helped team']);
  });

  it('suggests three taglines without quotes', async () => {
    const r = await suggestTaglines(
      fakeModel([JSON.stringify({ options: ['"One"', 'Two', 'Three', 'Four'] })]),
      'Fake',
      { name: 'J', headline: '', bio: '', highlights: [] },
    );
    expect(r.value).toEqual(['One', 'Two', 'Three']);
  });

  it('writes a case study and a meta description', async () => {
    const cs = await writeCaseStudy(
      fakeModel([JSON.stringify({ problem: 'P', role: 'R', process: 'X', outcome: 'O' })]),
      'Fake',
      {
        title: 't',
        summary: '',
        tech: [],
        answers: { problem: '', role: '', process: '', outcome: '' },
      },
    );
    expect(cs.value.body).toBe('');
    const md = await metaDescription(
      fakeModel([JSON.stringify({ description: 'x'.repeat(300) })]),
      'Fake',
      { name: '', headline: '', tagline: '', bio: '' },
    );
    expect(md.value).toHaveLength(160);
  });
});
