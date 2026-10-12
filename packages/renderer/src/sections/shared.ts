import type { SiteSpec } from '@pb/schema';
import { SECTION_CATALOG } from '../catalog.ts';
import { esc, initials } from '../html.ts';
import type { RenderOptions, SiteState } from '../types.ts';

export type Section = SiteSpec['sections'][number];
export type BehaviourName = 'nav' | 'theme' | 'reveal' | 'filter' | 'lightbox' | 'copy' | 'form';

export interface Ctx {
  state: SiteState;
  opts: RenderOptions;
  section: Section;
  /** Section heading (option `title`, else the catalogue default). */
  title: string;
  /** Inline-edit marker for a content path, only in editable preview. */
  edit(path: string): string;
  /** Inline-edit marker for a section option (e.g. its title). */
  editOption(key: string): string;
  /** Link to a project's case-study page, when those pages are on. */
  caseStudyHref(projectId: string): string | undefined;
  use(b: BehaviourName): void;
}

export interface SectionRenderer {
  /** Returns '' when there is nothing to show (empty sections are left out of exports). */
  render(ctx: Ctx): string;
  /** True when the section has content to show. */
  hasContent(state: SiteState): boolean;
  /** Message shown in the editor preview when hasContent is false. */
  emptyHint: string;
}

export function sectionTitle(section: Section): string {
  const t = section.options['title'];
  return typeof t === 'string' && t.trim() ? t.trim() : SECTION_CATALOG[section.type].defaultTitle;
}

/** Standard section wrapper with an accessible heading. */
export function wrap(
  ctx: Ctx,
  body: string,
  opts: { heading?: boolean; extraClass?: string } = {},
): string {
  const { section } = ctx;
  const id = esc(section.id);
  const heading = opts.heading !== false && ctx.title;
  return (
    `<section id="${id}" class="pb-section pb-${section.type} pb-${section.type}--${esc(section.variant)}${opts.extraClass ? ' ' + opts.extraClass : ''}"` +
    (heading
      ? ` aria-labelledby="${id}-title"`
      : ` aria-label="${esc(SECTION_CATALOG[section.type].label)}"`) +
    `><div class="pb-container">` +
    (heading
      ? `<h2 id="${id}-title" class="pb-section-title pb-reveal"${ctx.editOption('title')}>${esc(ctx.title)}</h2>`
      : '') +
    body +
    `</div></section>`
  );
}

export interface ImgOpts {
  className?: string;
  sizes?: string;
  alt?: string;
  /** Text for the placeholder when the image hasn't been uploaded. */
  placeholder?: string;
  eager?: boolean;
}

/** An uploaded image, or a decorative placeholder when it's missing. */
export function img(
  ctx: Ctx,
  ref: { assetId: string; alt?: string } | null | undefined,
  o: ImgOpts = {},
): string {
  const asset = ref ? ctx.opts.assets?.[ref.assetId] : undefined;
  const className = o.className ? ` class="${esc(o.className)}"` : '';
  if (!asset) {
    return `<div${className ? className.replace('class="', 'class="pb-ph ') : ' class="pb-ph"'} aria-hidden="true"><span>${esc(o.placeholder ?? '')}</span></div>`;
  }
  const alt = ref?.alt ?? o.alt ?? '';
  return (
    `<img${className} src="${esc(asset.src)}"` +
    (asset.srcset ? ` srcset="${esc(asset.srcset)}" sizes="${esc(o.sizes ?? '100vw')}"` : '') +
    (asset.width && asset.height ? ` width="${asset.width}" height="${asset.height}"` : '') +
    ` alt="${esc(alt)}" ${o.eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
  );
}

/**
 * The profile photo. Without one, the editor preview shows an initials placeholder
 * (a prompt to add a photo) and exports leave it out so layouts don't look unfinished.
 */
export const avatar = (ctx: Ctx, className: string, eager = false) =>
  hasPhoto(ctx) || ctx.opts.mode === 'preview'
    ? img(ctx, ctx.state.content.profile.photo, {
        className,
        placeholder: initials(ctx.state.content.profile.name || 'Your Name'),
        alt: ctx.state.content.profile.name,
        sizes: '(max-width: 600px) 60vw, 360px',
        eager,
      })
    : '';

export const hasPhoto = (ctx: Ctx) => {
  const ref = ctx.state.content.profile.photo;
  return !!ref && !!ctx.opts.assets?.[ref.assetId];
};

/** "2021 – Present" from free-text dates. */
export function dateRange(start: string, end: string): string {
  const s = start.trim();
  const e = end.trim();
  if (s && e) return `${esc(s)} – ${esc(e)}`;
  return esc(s || e);
}

export const tagList = (tags: string[], className = 'pb-tags') =>
  tags.length
    ? `<ul class="${className}" role="list">${tags.map((t) => `<li class="pb-tag">${esc(t)}</li>`).join('')}</ul>`
    : '';
