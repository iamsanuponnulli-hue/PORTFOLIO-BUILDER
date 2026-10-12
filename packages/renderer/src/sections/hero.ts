import { esc, linkAttrs, safeUrl } from '../html.ts';
import { avatar, type Ctx, type SectionRenderer } from './shared.ts';

function socials(ctx: Ctx): string {
  const links = ctx.state.content.profile.socials.filter((s) => s.url.trim());
  if (!links.length) return '';
  return `<ul class="pb-socials" role="list">${links
    .map(
      (s, i) =>
        `<li><a ${linkAttrs(s.url)}${ctx.edit(`profile.socials.${i}.label`)}>${esc(s.label || s.url)}</a></li>`,
    )
    .join('')}</ul>`;
}

function actions(ctx: Ctx): string {
  const ids = new Set(ctx.state.spec.sections.filter((s) => s.visible).map((s) => s.type));
  const work = ctx.state.spec.sections.find(
    (s) => s.visible && (s.type === 'projects' || s.type === 'gallery'),
  );
  const contact = ctx.state.spec.sections.find((s) => s.visible && s.type === 'contact');
  const btns: string[] = [];
  if (work) btns.push(`<a class="pb-btn pb-btn--primary" href="#${esc(work.id)}">See my work</a>`);
  if (contact) btns.push(`<a class="pb-btn" href="#${esc(contact.id)}">Get in touch</a>`);
  else if (ctx.state.content.profile.email && !ids.has('contact')) {
    btns.push(
      `<a class="pb-btn" href="${esc(safeUrl('mailto:' + ctx.state.content.profile.email))}">Email me</a>`,
    );
  }
  return btns.length ? `<div class="pb-actions">${btns.join('')}</div>` : '';
}

function textBlock(ctx: Ctx, opts: { eyebrowLocation?: boolean } = {}): string {
  const p = ctx.state.content.profile;
  return (
    (opts.eyebrowLocation !== false && p.location
      ? `<p class="pb-eyebrow"${ctx.edit('profile.location')}>${esc(p.location)}</p>`
      : '') +
    `<h1 class="pb-hero-name"${ctx.edit('profile.name')}>${esc(p.name || 'Your Name')}</h1>` +
    (p.headline
      ? `<p class="pb-hero-headline"${ctx.edit('profile.headline')}>${esc(p.headline)}</p>`
      : '') +
    (p.tagline
      ? `<p class="pb-hero-tagline"${ctx.edit('profile.tagline')}>${esc(p.tagline)}</p>`
      : '') +
    actions(ctx) +
    socials(ctx)
  );
}

function terminal(ctx: Ctx): string {
  const p = ctx.state.content.profile;
  const skills = ctx.state.content.skills.flatMap((g) => g.items).slice(0, 6);
  const line = (cmd: string, out: string) =>
    `<p><span class="pb-term-prompt" aria-hidden="true">$</span> ${esc(cmd)}</p><p class="pb-term-out">${out}</p>`;
  return (
    `<div class="pb-terminal" role="img" aria-label="${esc(`${p.name}. ${p.headline}`)}">` +
    `<div class="pb-term-bar" aria-hidden="true"><span></span><span></span><span></span></div>` +
    `<div class="pb-term-body" aria-hidden="true">` +
    line('whoami', esc(p.name || 'Your Name')) +
    (p.headline ? line('cat role.txt', esc(p.headline)) : '') +
    (p.location ? line('locate me', esc(p.location)) : '') +
    (skills.length ? line('ls skills/', skills.map(esc).join('  ')) : '') +
    `<p><span class="pb-term-prompt">$</span> <span class="pb-term-cursor"></span></p>` +
    `</div></div>`
  );
}

export const hero: SectionRenderer = {
  emptyHint: 'Add your name and headline.',
  hasContent: () => true,
  render(ctx) {
    const v = ctx.section.variant;
    const id = esc(ctx.section.id);
    const open = `<section id="${id}" class="pb-section pb-hero pb-hero--${esc(v)}" aria-label="Introduction"><div class="pb-container">`;
    const close = `</div></section>`;
    switch (v) {
      case 'centered':
        return `${open}<div class="pb-hero-centered pb-reveal">${avatar(ctx, 'pb-hero-avatar', true)}${textBlock(ctx)}</div>${close}`;
      case 'bigtype':
        return `${open}<div class="pb-hero-big pb-reveal">${textBlock(ctx)}</div>${close}`;
      case 'terminal':
        return `${open}<div class="pb-hero-split pb-reveal"><div class="pb-hero-text">${textBlock(ctx)}</div>${terminal(ctx)}</div>${close}`;
      default: {
        const media = avatar(ctx, 'pb-hero-photo', true);
        return media
          ? `${open}<div class="pb-hero-split pb-reveal"><div class="pb-hero-text">${textBlock(ctx)}</div><div class="pb-hero-media">${media}</div></div>${close}`
          : `${open}<div class="pb-hero-text pb-reveal">${textBlock(ctx)}</div>${close}`;
      }
    }
  },
};
