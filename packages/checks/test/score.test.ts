import { apply, applyAll, checkSite, themeIsReadable } from '@pb/renderer';
import { sampleState } from '@pb/renderer/samples';
import { describe, expect, it } from 'vitest';
import {
  altPath,
  computeScore,
  fixOperations,
  runnerScript,
  type FullReport,
} from '../src/index.ts';

const base = () => {
  const s = sampleState('developer');
  return { ...s, spec: { ...s.spec, seo: { ...s.spec.seo, url: 'https://jane.dev' } } };
};

describe('portfolio score', () => {
  it('scores a good site high and lists nothing serious', () => {
    const s = base();
    const score = computeScore(s, checkSite(s));
    expect(score.total).toBeGreaterThanOrEqual(85);
    expect(score.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(score.full).toBe(false);
  });

  it('loses points for problems, errors first, each with a fix where possible', () => {
    let s = base();
    s = apply(s, {
      op: 'updateTheme',
      tokens: {
        colors: {
          ...s.spec.theme.colors,
          light: { ...s.spec.theme.colors.light, text: '#dddddd' },
        },
      },
    });
    s = apply(s, { op: 'updateTheme', tokens: { colorMode: 'light' } });
    const full: FullReport = {
      widths: [
        {
          width: 390,
          overflow: true,
          offenders: ['pre.code'],
          axe: [{ id: 'image-alt', impact: 'critical', help: 'Images need alt text', nodes: 2 }],
          brokenLinks: ['#nope'],
        },
        {
          width: 1280,
          overflow: false,
          offenders: [],
          axe: [{ id: 'image-alt', impact: 'critical', help: 'Images need alt text', nodes: 2 }],
          brokenLinks: [],
        },
      ],
    };
    const score = computeScore(s, checkSite(s), full, [
      { fileId: 'big', bytes: 9 * 1024 * 1024, hasVariants: false },
    ]);
    expect(score.full).toBe(true);
    expect(score.total).toBeLessThan(80);
    expect(score.findings[0]!.severity).toBe('error');
    const ids = score.findings.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'overflow-390',
        'axe-image-alt',
        'link-#nope',
        'page-weight',
        'image-size-big',
      ]),
    );
    expect(ids.filter((i) => i === 'axe-image-alt')).toHaveLength(1);
    expect(score.categories.responsive).toBeLessThan(100);
    const contrast = score.findings.find((f) => f.id.startsWith('contrast-'))!;
    expect(contrast.fix).toBe('contrast');
    const fixed = applyAll(s, fixOperations(s, contrast)!);
    expect(themeIsReadable(fixed.spec.theme)).toBe(true);
  });

  it('fixes search settings and hides empty sections without AI', () => {
    let s = sampleState('student');
    s = {
      ...s,
      content: {
        ...s.content,
        profile: { ...s.content.profile, tagline: '', headline: 'CS student', location: 'Leeds' },
      },
    };
    s = apply(s, { op: 'addSection', type: 'testimonials', variant: 'grid', index: 2 });
    s = { ...s, content: { ...s.content, testimonials: [] } };
    const score = computeScore(s, checkSite(s));
    const desc = score.findings.find((f) => f.fix === 'seoDescription')!;
    const after = applyAll(s, fixOperations(s, desc)!);
    expect(after.spec.seo.description).toContain('CS student, based in Leeds');
    const empty = score.findings.find((f) => f.fix === 'hideSection')!;
    const hidden = applyAll(s, fixOperations(s, empty)!);
    expect(hidden.spec.sections.find((x) => x.id === empty.sectionId)!.visible).toBe(false);
    expect(
      fixOperations(s, { id: 'x', category: 'content', severity: 'info', message: '' }),
    ).toBeUndefined();
  });

  it('writes plain alt text from context and finds alt paths', () => {
    let s = sampleState('designer');
    const pid = s.content.projects[0]!.id;
    s = apply(s, {
      op: 'updateContent',
      path: `projects.${pid}.images`,
      value: [{ assetId: 'shot', alt: '' }],
    });
    expect(altPath(s, 'shot')).toBe(`projects.${pid}.images.0.alt`);
    const ops = fixOperations(s, {
      id: 'alt-shot',
      category: 'accessibility',
      severity: 'warning',
      message: '',
      fix: 'altText',
    })!;
    const next = applyAll(s, ops);
    expect(next.content.projects[0]!.images[0]!.alt).toBe(s.content.projects[0]!.title);
  });
});

describe('runner script', () => {
  it('reports back with the run id', () => {
    const js = runnerScript('run-1', 390);
    expect(js).toContain('"run-1"');
    expect(js).toContain('parent.postMessage');
    expect(() => new Function(js)).not.toThrow();
  });
});
