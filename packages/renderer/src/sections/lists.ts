import { esc, linkAttrs } from '../html.ts';
import { dateRange, wrap, type Ctx, type SectionRenderer } from './shared.ts';

type Simple = Ctx['state']['content']['certifications'][number];

function simpleItems(
  ctx: Ctx,
  key: 'certifications' | 'awards' | 'writing',
  items: Simple[],
): string {
  const cards = ctx.section.variant === 'cards';
  return (
    `<ul class="${cards ? 'pb-simple-cards' : 'pb-simple-list'}" role="list">` +
    items
      .map((it) => {
        const base = `${key}.${it.id}`;
        const title = it.url.trim()
          ? `<a ${linkAttrs(it.url)}${ctx.edit(`${base}.title`)}>${esc(it.title)}</a>`
          : `<span${ctx.edit(`${base}.title`)}>${esc(it.title)}</span>`;
        const meta = [it.issuer, it.date]
          .filter((x) => x.trim())
          .map(esc)
          .join(' · ');
        return (
          `<li class="${cards ? 'pb-card ' : ''}pb-simple pb-reveal"><h3 class="pb-simple-title">${title}</h3>` +
          (meta ? `<p class="pb-meta">${meta}</p>` : '') +
          (it.description
            ? `<p${ctx.edit(`${base}.description`)}>${esc(it.description)}</p>`
            : '') +
          `</li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

const simpleSection = (
  key: 'certifications' | 'awards' | 'writing',
  hint: string,
): SectionRenderer => ({
  emptyHint: hint,
  hasContent: (s) => s.content[key].length > 0,
  render: (ctx) => wrap(ctx, simpleItems(ctx, key, ctx.state.content[key])),
});

export const certifications = simpleSection(
  'certifications',
  'Add certifications in Content → Certifications.',
);
export const awards = simpleSection('awards', 'Add awards in Content → Awards.');
export const writing = simpleSection(
  'writing',
  'Add articles in Content → Writing, or import your blog feed.',
);

export const education: SectionRenderer = {
  emptyHint: 'Add schools in Content → Education.',
  hasContent: (s) => s.content.education.length > 0,
  render(ctx) {
    const cards = ctx.section.variant === 'cards';
    const items = ctx.state.content.education
      .map((e) => {
        const base = `education.${e.id}`;
        return (
          `<li class="${cards ? 'pb-card ' : ''}pb-edu pb-reveal">` +
          `<h3 class="pb-simple-title"${ctx.edit(`${base}.institution`)}>${esc(e.institution)}</h3>` +
          (e.degree ? `<p${ctx.edit(`${base}.degree`)}>${esc(e.degree)}</p>` : '') +
          `<p class="pb-meta">${dateRange(e.start, e.end)}</p>` +
          (e.details.length
            ? `<ul class="pb-bullets">${e.details.map((d, i) => `<li${ctx.edit(`${base}.details.${i}`)}>${esc(d)}</li>`).join('')}</ul>`
            : '') +
          `</li>`
        );
      })
      .join('');
    return wrap(
      ctx,
      `<ul class="${cards ? 'pb-simple-cards' : 'pb-simple-list'}" role="list">${items}</ul>`,
    );
  },
};
