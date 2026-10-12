import { SECTION_CATALOG } from './catalog.ts';
import { googleFontsUrl } from './fonts.ts';
import { esc, paragraphs } from './html.ts';
import { img, sectionTitle, type Ctx } from './sections/shared.ts';
import type { RenderOptions, SiteState } from './types.ts';

const SUN_MOON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const MENU =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

export interface PageParts {
  title: string;
  description: string;
  body: string;
  /** "" for the home page, "../" for pages one folder down. */
  root: string;
  /** Path of this page relative to the site root, for canonical URLs. */
  path: string;
  fonts: string[];
}

function absolute(state: SiteState, path: string): string | undefined {
  const base = state.spec.seo.url.trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return undefined;
  return path ? `${base}/${path}` : `${base}/`;
}

function jsonLd(state: SiteState): string {
  const p = state.content.profile;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
  };
  if (p.headline) data['jobTitle'] = p.headline;
  if (p.location) data['address'] = p.location;
  const url = absolute(state, '');
  if (url) data['url'] = url;
  const same = p.socials.map((s) => s.url).filter((u) => /^https?:/i.test(u));
  if (same.length) data['sameAs'] = same;
  // Escape "<" so the JSON can't close the script element.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function document(state: SiteState, opts: RenderOptions, page: PageParts): string {
  const canonical = absolute(state, page.path);
  const ogImage = absolute(state, 'og-image.png');
  const fontLink =
    opts.fontSource === 'google' && googleFontsUrl(page.fonts)
      ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${esc(googleFontsUrl(page.fonts)!)}">`
      : '';
  const themeBoot =
    state.spec.theme.colorMode === 'auto'
      ? `<script>try{var t=localStorage.getItem('pb-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`
      : '';
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${esc(page.title)}</title>\n` +
    (page.description ? `<meta name="description" content="${esc(page.description)}">\n` : '') +
    (canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : '') +
    `<meta property="og:type" content="website">\n<meta property="og:title" content="${esc(page.title)}">\n` +
    (page.description
      ? `<meta property="og:description" content="${esc(page.description)}">\n`
      : '') +
    (canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : '') +
    (ogImage
      ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">\n`
      : '') +
    `<link rel="icon" href="${page.root}favicon.ico">\n` +
    fontLink +
    themeBoot +
    `<link rel="stylesheet" href="${page.root}assets/css/theme.css">\n` +
    `<link rel="stylesheet" href="${page.root}assets/css/base.css">\n` +
    `<link rel="stylesheet" href="${page.root}assets/css/sections.css">\n` +
    `<link rel="stylesheet" href="${page.root}assets/css/custom.css">\n` +
    (page.path === '' ? jsonLd(state) + '\n' : '') +
    `</head>\n<body>\n<a class="pb-skip" href="#main">Skip to content</a>\n` +
    page.body +
    `\n<script src="${page.root}assets/js/main.js" defer></script>\n<script src="${page.root}assets/js/custom.js" defer></script>\n` +
    `</body>\n</html>\n`
  );
}

export function header(state: SiteState, ctxUse: Ctx['use'], root: string, home = true): string {
  const p = state.content.profile;
  const variant = state.spec.nav.variant === 'minimal' ? 'minimal' : 'top';
  const links = state.spec.sections
    .filter((s) => s.visible && s.type !== 'hero')
    .slice(0, 6)
    .map(
      (s) =>
        `<a href="${home ? '' : root + 'index.html'}#${esc(s.id)}">${esc(sectionTitle(s) || SECTION_CATALOG[s.type].label)}</a>`,
    )
    .join('');
  const toggle = state.spec.theme.colorMode === 'auto';
  if (toggle) ctxUse('theme');
  if (variant === 'top' && links) ctxUse('nav');
  return (
    `<header class="pb-header pb-header--${variant}"><div class="pb-container">` +
    `<a class="pb-brand" href="${home ? '#main' : root + 'index.html'}">${esc(p.name || 'Home')}</a>` +
    `<nav class="pb-nav-tools" aria-label="Main">` +
    (variant === 'top' && links
      ? `<button type="button" class="pb-icon-btn pb-menu-btn" aria-expanded="false" aria-label="Menu">${MENU}</button><div class="pb-nav-links">${links}</div>`
      : '') +
    (toggle
      ? `<button type="button" class="pb-icon-btn" data-pb-theme-toggle aria-label="Switch theme">${SUN_MOON}</button>`
      : '') +
    `</nav></div></header>`
  );
}

export function footer(state: SiteState, opts: RenderOptions): string {
  const year = (opts.now ?? new Date()).getFullYear();
  const p = state.content.profile;
  return (
    `<footer class="pb-footer"><div class="pb-container">` +
    `<p>© ${year} ${esc(p.name)}</p>` +
    (p.email ? `<p><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></p>` : '') +
    `</div></footer>`
  );
}

/** projects/<slug>.html for a project with a case study. */
export function caseStudyBody(ctx: Ctx, projectId: string): string {
  const p = ctx.state.content.projects.find((x) => x.id === projectId)!;
  const cs = p.caseStudy!;
  const base = `projects.${p.id}`;
  const part = (key: 'problem' | 'role' | 'process' | 'outcome', label: string) =>
    cs[key].trim()
      ? `<section class="pb-case-section"><h2>${label}</h2><div class="pb-prose"${ctx.edit(`${base}.caseStudy.${key}`)}>${paragraphs(cs[key])}</div></section>`
      : '';
  const [first, ...rest] = p.images;
  return (
    `<main id="main" class="pb-case"><div class="pb-container">` +
    `<a class="pb-case-back" href="../index.html#projects">← All projects</a>` +
    `<h1${ctx.edit(`${base}.title`)}>${esc(p.title)}</h1>` +
    (p.summary
      ? `<p class="pb-case-summary"${ctx.edit(`${base}.summary`)}>${esc(p.summary)}</p>`
      : '') +
    img(ctx, first, {
      className: 'pb-case-hero',
      placeholder: p.title,
      eager: true,
      sizes: '(max-width: 900px) 100vw, 52rem',
    }) +
    part('problem', 'The problem') +
    part('role', 'My role') +
    part('process', 'Process') +
    part('outcome', 'Outcome') +
    (cs.body.trim()
      ? `<section class="pb-case-section"><div class="pb-prose"${ctx.edit(`${base}.caseStudy.body`)}>${paragraphs(cs.body)}</div></section>`
      : '') +
    (rest.length
      ? `<div class="pb-case-images">${rest.map((im) => img(ctx, im, { placeholder: p.title })).join('')}</div>`
      : '') +
    `</div></main>`
  );
}
