import { behavioursJs } from './behaviours.ts';
import { checkSite } from './checks.ts';
import { BASE_CSS, SECTION_CSS } from './css.ts';
import { selfHostedFontFaces } from './fonts.ts';
import { esc, slugify } from './html.ts';
import { caseStudyBody, document, footer, header } from './layout.ts';
import { SECTIONS } from './sections/index.ts';
import { fontsUsed, themeCss } from './theme.ts';
import { sectionTitle, type BehaviourName, type Ctx, type Section } from './sections/shared.ts';
import type { RenderOptions, RenderResult, SiteFiles, SiteState } from './types.ts';

/** Stable, unique file names for case-study pages. */
export function caseStudySlugs(state: SiteState): Map<string, string> {
  const out = new Map<string, string>();
  if (!state.spec.pages.caseStudies) return out;
  const used = new Set<string>();
  for (const p of state.content.projects) {
    if (!p.caseStudy) continue;
    let slug = slugify(p.title);
    for (let n = 2; used.has(slug); n++) slug = `${slugify(p.title)}-${n}`;
    used.add(slug);
    out.set(p.id, slug);
  }
  return out;
}

function makeCtx(
  state: SiteState,
  opts: RenderOptions,
  used: Set<BehaviourName>,
  slugs: Map<string, string>,
  section: Section,
  root: string,
): Ctx {
  const editable = opts.mode === 'preview' && !!opts.editable;
  return {
    state,
    opts,
    section,
    title: sectionTitle(section),
    edit: (path) => (editable ? ` data-pb-edit="content:${esc(path)}"` : ''),
    editOption: (key) => (editable ? ` data-pb-edit="option:${esc(section.id)}:${esc(key)}"` : ''),
    caseStudyHref: (id) => (slugs.has(id) ? `${root}projects/${slugs.get(id)}.html` : undefined),
    use: (b) => used.add(b),
  };
}

function renderSection(ctx: Ctx): string {
  const { section, state, opts } = ctx;
  const marker = (body: string) =>
    `<!-- pb:section id="${esc(section.id)}" -->\n${body}\n<!-- /pb:section -->`;
  if (section.custom) {
    const c = state.custom.sections[section.id];
    return marker(c?.html ?? '');
  }
  const r = SECTIONS[section.type];
  if (!r.hasContent(state)) {
    if (opts.mode !== 'preview') return '';
    return marker(
      `<section id="${esc(section.id)}" class="pb-section"><div class="pb-container">` +
        (ctx.title ? `<h2 class="pb-section-title">${esc(ctx.title)}</h2>` : '') +
        `<p class="pb-empty">${esc(r.emptyHint)}</p></div></section>`,
    );
  }
  return marker(r.render(ctx));
}

/**
 * Builds the whole site. Deterministic: the same state and options always give the
 * same files. Runs in the browser (preview, export) and in tests.
 */
export function render(state: SiteState, opts: RenderOptions = { mode: 'export' }): RenderResult {
  const used = new Set<BehaviourName>();
  const slugs = caseStudySlugs(state);
  const fonts = opts.fontSource === 'system' ? [] : fontsUsed(state.spec.theme);
  if (state.spec.theme.motion !== 'none') used.add('reveal');

  const visible = state.spec.sections.filter((s) => s.visible);
  const ctxFor = (s: Section, root: string) => makeCtx(state, opts, used, slugs, s, root);
  const headerHtml = header(state, (b) => used.add(b), '', true);
  const sectionsHtml = visible
    .map((s) => renderSection(ctxFor(s, '')))
    .filter(Boolean)
    .join('\n');

  const profile = state.content.profile;
  const seo = state.spec.seo;
  const title =
    seo.title || [profile.name, profile.headline].filter(Boolean).join(' — ') || 'Portfolio';
  const description =
    seo.description || profile.tagline || profile.bio.split(/\n/)[0]?.slice(0, 160) || '';

  const files: SiteFiles = {};
  files['index.html'] = document(state, opts, {
    title,
    description,
    root: '',
    path: '',
    fonts,
    body: `${headerHtml}\n<main id="main">\n${sectionsHtml}\n</main>\n${footer(state, opts)}`,
  });

  for (const [projectId, slug] of slugs) {
    const p = state.content.projects.find((x) => x.id === projectId)!;
    const caseSection: Section = {
      id: 'case',
      type: 'projects',
      variant: 'grid',
      visible: true,
      options: {},
      custom: false,
    };
    files[`projects/${slug}.html`] = document(state, opts, {
      title: `${p.title} — ${profile.name || 'Portfolio'}`,
      description: p.summary,
      root: '../',
      path: `projects/${slug}.html`,
      fonts,
      body: `${header(state, (b) => used.add(b), '../', false)}\n${caseStudyBody(ctxFor(caseSection, '../'), projectId)}\n${footer(state, opts)}`,
    });
  }

  const fontFaces =
    opts.fontSource === 'self-hosted' ? selfHostedFontFaces(fonts, '../fonts/') + '\n' : '';
  files['assets/css/theme.css'] = fontFaces + themeCss(state.spec.theme);
  files['assets/css/base.css'] = BASE_CSS.trimStart();
  files['assets/css/sections.css'] = SECTION_CSS.trimStart() + customSectionCss(state);
  files['assets/css/custom.css'] = state.custom.css;
  files['assets/js/main.js'] = behavioursJs(used);
  files['assets/js/custom.js'] = [
    state.custom.js,
    ...visible.filter((s) => s.custom).map((s) => state.custom.sections[s.id]?.js ?? ''),
  ]
    .filter((x) => x.trim())
    .join('\n;\n');

  const siteUrl = seo.url.trim().replace(/\/+$/, '');
  if (/^https:\/\//i.test(siteUrl)) {
    const pages = ['', ...[...slugs.values()].map((s) => `projects/${s}.html`)];
    files['sitemap.xml'] =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      pages.map((p) => `  <url><loc>${esc(`${siteUrl}/${p}`)}</loc></url>`).join('\n') +
      `\n</urlset>\n`;
    files['robots.txt'] = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
  } else {
    files['robots.txt'] = `User-agent: *\nAllow: /\n`;
  }

  return { files, checks: checkSite(state, opts), fonts };
}

function customSectionCss(state: SiteState): string {
  const css = state.spec.sections
    .filter((s) => s.custom && s.visible)
    .map((s) => state.custom.sections[s.id]?.css ?? '')
    .filter((c) => c.trim());
  return css.length ? `\n/* Custom sections */\n${css.join('\n')}\n` : '';
}

/**
 * One self-contained HTML document for the editor's sandboxed preview iframe:
 * stylesheets and scripts are inlined because the iframe has no site folder.
 */
export function previewDocument(files: SiteFiles, page = 'index.html'): string {
  let html = files[page] ?? '';
  const inline = (path: string) => (files[path] ?? '').replace(/<\/(style|script)/gi, '<\\/$1');
  html = html.replace(
    /<link rel="stylesheet" href="(?:\.\.\/)?(assets\/css\/[a-z]+\.css)">/g,
    (_m, p: string) => `<style>${inline(p)}</style>`,
  );
  html = html.replace(
    /<script src="(?:\.\.\/)?(assets\/js\/[a-z]+\.js)" defer><\/script>/g,
    (_m, p: string) =>
      files[p]?.trim() ? `<script>window.__PB_PREVIEW__=true;\n${inline(p)}</script>` : '',
  );
  return html;
}
