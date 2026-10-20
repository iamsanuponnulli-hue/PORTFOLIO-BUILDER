import type { ThemeTokens } from '@pb/schema';
import { SECTION_CATALOG } from './catalog.ts';
import { sectionTitle } from './sections/shared.ts';
import type { SiteState } from './types.ts';

type Section = SiteState['spec']['sections'][number];

const TOKEN_LABELS: Partial<Record<keyof ThemeTokens, string>> = {
  scale: 'Text size steps',
  radius: 'Corner rounding',
  density: 'Spacing',
  shadow: 'Shadows',
  motion: 'Motion',
  width: 'Page width',
  colorMode: 'Light/dark mode',
};

const CONTENT_LABELS: Record<string, [string, string]> = {
  experience: ['job', 'jobs'],
  projects: ['project', 'projects'],
  skills: ['skill group', 'skill groups'],
  education: ['education entry', 'education entries'],
  certifications: ['certification', 'certifications'],
  awards: ['award', 'awards'],
  writing: ['article', 'articles'],
  testimonials: ['testimonial', 'testimonials'],
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const name = (s: Section) => sectionTitle(s) || SECTION_CATALOG[s.type].label;
const variantLabel = (s: Section) =>
  SECTION_CATALOG[s.type].variants.find((v) => v.id === s.variant)?.label ?? s.variant;
const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

/**
 * A short, human-readable list of what changed between two versions of a site:
 * used for the assistant's change summary and for comparing versions.
 */
export function describeChanges(before: SiteState, after: SiteState): string[] {
  const out: string[] = [];
  const t0 = before.spec.theme;
  const t1 = after.spec.theme;
  if (!same(t0.colors, t1.colors)) out.push('Colours changed');
  if (t0.fonts.heading !== t1.fonts.heading)
    out.push(`Heading font: ${t0.fonts.heading} → ${t1.fonts.heading}`);
  if (t0.fonts.body !== t1.fonts.body) out.push(`Body font: ${t0.fonts.body} → ${t1.fonts.body}`);
  for (const [k, label] of Object.entries(TOKEN_LABELS) as [keyof ThemeTokens, string][])
    if (t0[k] !== t1[k]) out.push(`${label}: ${String(t0[k])} → ${String(t1[k])}`);

  const s0 = before.spec.sections;
  const s1 = after.spec.sections;
  for (const s of s1) if (!s0.some((x) => x.id === s.id)) out.push(`Added section: ${name(s)}`);
  for (const s of s0) if (!s1.some((x) => x.id === s.id)) out.push(`Removed section: ${name(s)}`);
  const order0 = s0.filter((s) => s1.some((x) => x.id === s.id)).map((s) => s.id);
  const order1 = s1.filter((s) => s0.some((x) => x.id === s.id)).map((s) => s.id);
  if (!same(order0, order1)) out.push('Sections reordered');
  for (const s of s1) {
    const prev = s0.find((x) => x.id === s.id);
    if (!prev) continue;
    if (prev.visible !== s.visible) out.push(`${s.visible ? 'Showing' : 'Hid'} ${name(s)}`);
    if (prev.variant !== s.variant)
      out.push(`${name(s)} layout: ${variantLabel(prev)} → ${variantLabel(s)}`);
    if (!prev.custom && s.custom) out.push(`${name(s)} is now custom code`);
    if (prev.custom && !s.custom) out.push(`${name(s)} uses the generated layout again`);
    if (prev.custom && s.custom && !same(before.custom.sections[s.id], after.custom.sections[s.id]))
      out.push(`${name(s)} code edited`);
    if (!same(prev.options, s.options)) {
      if (sectionTitle(prev) !== sectionTitle(s))
        out.push(`Section title: "${sectionTitle(prev)}" → "${sectionTitle(s)}"`);
      else out.push(`${name(s)} options changed`);
    }
  }
  if (before.spec.nav.variant !== after.spec.nav.variant) out.push('Navigation layout changed');
  if (!same(before.spec.seo, after.spec.seo)) out.push('Search & sharing settings changed');
  if (before.spec.pages.caseStudies !== after.spec.pages.caseStudies)
    out.push(after.spec.pages.caseStudies ? 'Case-study pages on' : 'Case-study pages off');
  if (!same(before.contactForm, after.contactForm)) out.push('Contact form settings changed');
  if (before.custom.css !== after.custom.css) out.push('custom.css edited');
  if (before.custom.js !== after.custom.js) out.push('custom.js edited');

  const p0 = before.content.profile as Record<string, unknown>;
  const p1 = after.content.profile as Record<string, unknown>;
  for (const k of Object.keys(p1))
    if (!same(p0[k], p1[k])) out.push(`Profile ${k === 'bio' ? 'about text' : k} changed`);
  for (const [key, label] of Object.entries(CONTENT_LABELS)) {
    const a = (before.content as Record<string, unknown>)[key] as { id?: string }[];
    const b = (after.content as Record<string, unknown>)[key] as { id?: string }[];
    if (same(a, b)) continue;
    const ids = (x: { id?: string }[]) => x.map((v, i) => v.id ?? String(i));
    const added = ids(b).filter((id) => !ids(a).includes(id)).length;
    const removed = ids(a).filter((id) => !ids(b).includes(id)).length;
    const edited = b.filter((v, i) => {
      const prev = a.find((x, j) => (x.id ?? String(j)) === (v.id ?? String(i)));
      return prev && !same(prev, v);
    }).length;
    if (added) out.push(`Added ${plural(added, label)}`);
    if (removed) out.push(`Removed ${plural(removed, label)}`);
    if (edited) out.push(`Edited ${plural(edited, label)}`);
    if (!added && !removed && !edited) out.push(`Reordered ${label[1]}`);
  }
  return out;
}
