import { esc, linkAttrs, slugify } from '../html.ts';
import { img, tagList, wrap, type Ctx, type SectionRenderer } from './shared.ts';

type Project = Ctx['state']['content']['projects'][number];

function card(ctx: Ctx, p: Project, featured = false): string {
  const base = `projects.${p.id}`;
  const href = ctx.caseStudyHref(p.id);
  const title = href
    ? `<a href="${esc(href)}" class="pb-card-link"${ctx.edit(`${base}.title`)}>${esc(p.title)}</a>`
    : `<span${ctx.edit(`${base}.title`)}>${esc(p.title)}</span>`;
  const links = p.links.filter((l) => l.url.trim());
  const tags = [...new Set([...p.tags, ...p.tech])];
  return (
    `<li class="pb-project pb-card${featured ? ' pb-project--featured' : ''} pb-reveal" data-tags="${esc(p.tags.map(slugify).join(' '))}">` +
    img(ctx, p.images[0], {
      className: 'pb-project-img',
      placeholder: p.title,
      sizes: featured ? '(max-width: 800px) 100vw, 60vw' : '(max-width: 800px) 100vw, 33vw',
    }) +
    `<div class="pb-card-body">` +
    `<h3 class="pb-card-title">${title}</h3>` +
    (p.role ? `<p class="pb-meta"${ctx.edit(`${base}.role`)}>${esc(p.role)}</p>` : '') +
    (p.summary ? `<p${ctx.edit(`${base}.summary`)}>${esc(p.summary)}</p>` : '') +
    tagList(tags) +
    (links.length || href
      ? `<p class="pb-card-links">${href ? `<a href="${esc(href)}">Read case study<span class="pb-sr"> about ${esc(p.title)}</span></a>` : ''}${links
          .map(
            (l) =>
              `<a ${linkAttrs(l.url)}>${esc(l.label || 'Link')}<span class="pb-sr"> for ${esc(p.title)}</span></a>`,
          )
          .join('')}</p>`
      : '') +
    `</div></li>`
  );
}

function filters(ctx: Ctx): string {
  if (ctx.section.options['filter'] !== true) return '';
  const tags = [...new Set(ctx.state.content.projects.flatMap((p) => p.tags))];
  if (tags.length < 2) return '';
  ctx.use('filter');
  return (
    `<div class="pb-filters" role="group" aria-label="Filter projects">` +
    `<button type="button" class="pb-chip" data-pb-filter="" aria-pressed="true">All</button>` +
    tags
      .map(
        (t) =>
          `<button type="button" class="pb-chip" data-pb-filter="${esc(slugify(t))}" aria-pressed="false">${esc(t)}</button>`,
      )
      .join('') +
    `</div>`
  );
}

export const projects: SectionRenderer = {
  emptyHint: 'Add projects in Content → Projects, or import them from GitHub.',
  hasContent: (s) => s.content.projects.length > 0,
  render(ctx) {
    const v = ctx.section.variant;
    const all = ctx.state.content.projects;
    if (v === 'featured') {
      const lead = all.find((p) => p.featured) ?? all[0]!;
      const rest = all.filter((p) => p !== lead);
      return wrap(
        ctx,
        filters(ctx) +
          `<ul class="pb-projects-grid pb-projects-grid--featured" role="list">${card(ctx, lead, true)}${rest.map((p) => card(ctx, p)).join('')}</ul>`,
      );
    }
    return wrap(
      ctx,
      filters(ctx) +
        `<ul class="pb-projects-grid pb-projects-grid--${esc(v)}" role="list">${all.map((p) => card(ctx, p)).join('')}</ul>`,
    );
  },
};
