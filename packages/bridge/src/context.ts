import {
  FONTS,
  LIBRARY_TYPES,
  NAV_VARIANTS,
  PRESETS,
  SECTION_CATALOG,
  type SiteState,
} from '@pb/renderer';
import type { PortfolioContent } from '@pb/schema';

/**
 * What the AI is told about the site. Kept compact so small free models with short
 * context windows can handle it.
 */

const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const q = (s: string) => JSON.stringify(clip(s));

/** The section library, presets and fonts as text. */
export function catalogText(): string {
  const lines = ['Section types and their layouts (type: layout ids):'];
  for (const t of LIBRARY_TYPES)
    lines.push(
      `- ${t} (${SECTION_CATALOG[t].label}): ${SECTION_CATALOG[t].variants.map((v) => `${v.id} = ${v.label}`).join('; ')}`,
    );
  lines.push(`Navigation layouts: ${NAV_VARIANTS.map((v) => v.id).join(', ')}`);
  lines.push(`Theme presets: ${PRESETS.map((p) => p.id).join(', ')}`);
  lines.push(`Fonts: ${FONTS.map((f) => `${f.family} (${f.category})`).join(', ')}`);
  return lines.join('\n');
}

/** Every editable text with its content path, for assistant edits. */
export function contentOutline(c: PortfolioContent, limit = 12_000): string {
  const out: string[] = [];
  const p = c.profile;
  for (const k of ['name', 'headline', 'tagline', 'bio', 'location', 'email'] as const)
    if (p[k]) out.push(`profile.${k}: ${q(p[k])}`);
  p.socials.forEach((s, i) => out.push(`profile.socials.${i}: ${s.label} ${s.url}`));
  for (const e of c.experience) {
    out.push(
      `experience.${e.id}: ${q(e.role)} at ${q(e.company)} (${[e.start, e.end].filter(Boolean).join(' – ')})`,
    );
    e.bullets.forEach((b, i) => out.push(`  experience.${e.id}.bullets.${i}: ${q(b)}`));
  }
  for (const x of c.projects) {
    out.push(`projects.${x.id}.title: ${q(x.title)}${x.featured ? ' (featured)' : ''}`);
    if (x.summary) out.push(`  projects.${x.id}.summary: ${q(x.summary)}`);
    if (x.tech.length) out.push(`  projects.${x.id}.tech: ${x.tech.join(', ')}`);
  }
  c.skills.forEach((g, i) => out.push(`skills.${i}: ${g.group}: ${g.items.join(', ')}`));
  for (const key of ['education', 'certifications', 'awards', 'writing'] as const)
    for (const it of c[key] as { id: string; title?: string; institution?: string }[])
      out.push(`${key}.${it.id}: ${q(it.title ?? it.institution ?? '')}`);
  for (const t of c.testimonials) out.push(`testimonials.${t.id}: ${q(t.quote)} — ${t.author}`);
  let text = '';
  for (const line of out) {
    if (text.length + line.length > limit) {
      text += '… (more content not shown)\n';
      break;
    }
    text += line + '\n';
  }
  return text || '(no content yet)';
}

/** What content exists, so designs leave out sections with nothing to show. */
export function contentSummary(state: Pick<SiteState, 'content'>): string {
  const c = state.content;
  const n = (label: string, count: number) => `${label}: ${count || 'none'}`;
  return [
    `Name: ${c.profile.name || '(not set)'}; headline: ${c.profile.headline || '(none)'}`,
    `Photo: ${c.profile.photo ? 'yes' : 'no'}; about text: ${c.profile.bio.length > 40 ? 'yes' : 'no'}`,
    n('Jobs', c.experience.length),
    n('Projects', c.projects.length) +
      (c.projects.some((p) => p.images.length) ? ' (with images)' : ' (no images)'),
    n('Skill groups', c.skills.length),
    n('Education', c.education.length),
    n('Certifications', c.certifications.length),
    n('Awards', c.awards.length),
    n('Articles', c.writing.length),
    n('Testimonials', c.testimonials.length),
  ].join('\n');
}
