import { describe, expect, it } from 'vitest';
import { esc, paragraphs, safeUrl, slugify } from '../src/html.ts';
import { getAt, setAt } from '../src/paths.ts';

describe('escaping and links', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<img src=x onerror="alert(1)">&\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;',
    );
  });

  it('blocks script and data URLs', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:x',
      'data:text/html,<b>',
      'vbscript:x',
    ]) {
      expect(safeUrl(bad)).toBe('#');
    }
  });

  it('keeps safe links and fixes bare domains', () => {
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('mailto:jane@example.com')).toBe('mailto:jane@example.com');
    expect(safeUrl('#projects')).toBe('#projects');
    expect(safeUrl('github.com/jane')).toBe('https://github.com/jane');
    expect(safeUrl('')).toBe('#');
  });

  it('turns blank-line text into paragraphs without passing HTML through', () => {
    expect(paragraphs('One\n\nTwo <b>x</b>')).toBe('<p>One</p><p>Two &lt;b&gt;x&lt;/b&gt;</p>');
  });

  it('makes URL-safe slugs', () => {
    expect(slugify('Glucose Diary — Redesign!')).toBe('glucose-diary-redesign');
    expect(slugify('Café Ünïcode')).toBe('cafe-unicode');
    expect(slugify('***')).toBe('item');
  });
});

describe('content paths', () => {
  const doc = { profile: { name: 'A' }, projects: [{ id: 'p1', title: 'T', bullets: ['x', 'y'] }] };

  it('reads by id and index', () => {
    expect(getAt(doc, 'profile.name')).toBe('A');
    expect(getAt(doc, 'projects.p1.title')).toBe('T');
    expect(getAt(doc, 'projects.p1.bullets.1')).toBe('y');
    expect(getAt(doc, 'projects.nope.title')).toBeUndefined();
  });

  it('writes without mutating the original', () => {
    const next = setAt(doc, 'projects.p1.bullets.0', 'z');
    expect(getAt(next, 'projects.p1.bullets.0')).toBe('z');
    expect(doc.projects[0]!.bullets[0]).toBe('x');
    expect(next.profile).toBe(doc.profile); // untouched branches are shared
  });

  it('rejects unknown targets and prototype keys', () => {
    expect(() => setAt(doc, 'projects.nope.title', 'x')).toThrow();
    expect(() => setAt(doc, 'missing.field', 'x')).toThrow();
    expect(() => setAt(doc, '__proto__.polluted', 'x')).toThrow();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
