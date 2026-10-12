import { esc, linkAttrs, safeUrl } from '../html.ts';
import type { ContactFormConfig } from '../types.ts';
import { wrap, type Ctx, type SectionRenderer } from './shared.ts';

/** Where the form posts, per form service. Returns undefined when not configured. */
export function formTarget(cf: ContactFormConfig): { action: string; hidden: string } | undefined {
  const v = cf.value.trim();
  if (!v) return undefined;
  switch (cf.service) {
    case 'formspree': {
      const id = v.replace(/^https?:\/\/formspree\.io\//, '').replace(/^f\//, '');
      return /^[a-zA-Z0-9]+$/.test(id)
        ? { action: `https://formspree.io/f/${id}`, hidden: '' }
        : undefined;
    }
    case 'web3forms':
      return /^[a-zA-Z0-9-]+$/.test(v)
        ? {
            action: 'https://api.web3forms.com/submit',
            hidden: `<input type="hidden" name="access_key" value="${esc(v)}">`,
          }
        : undefined;
    case 'endpoint':
      return /^https:\/\//i.test(v) ? { action: v, hidden: '' } : undefined;
    default:
      return undefined;
  }
}

function links(ctx: Ctx): string {
  const p = ctx.state.content.profile;
  const items: string[] = [];
  if (p.email) {
    ctx.use('copy');
    items.push(
      `<li><a href="${esc(safeUrl('mailto:' + p.email))}"${ctx.edit('profile.email')}>${esc(p.email)}</a>` +
        ` <button type="button" class="pb-chip" data-pb-copy="${esc(p.email)}">Copy</button></li>`,
    );
  }
  for (const s of p.socials.filter((x) => x.url.trim())) {
    items.push(`<li><a ${linkAttrs(s.url)}>${esc(s.label || s.url)}</a></li>`);
  }
  return items.length ? `<ul class="pb-contact-links" role="list">${items.join('')}</ul>` : '';
}

function form(ctx: Ctx): string {
  const cf = ctx.state.contactForm;
  if (cf.service === 'link' && cf.value.trim()) {
    return `<p><a class="pb-btn pb-btn--primary" ${linkAttrs(cf.value)}>Send me a message</a></p>`;
  }
  const target = formTarget(cf);
  if (!target) return '';
  ctx.use('form');
  const id = esc(ctx.section.id);
  return (
    `<form class="pb-form" method="POST" action="${esc(target.action)}" data-pb-form>` +
    target.hidden +
    `<div class="pb-field"><label for="${id}-name">Name</label><input id="${id}-name" name="name" autocomplete="name" required></div>` +
    `<div class="pb-field"><label for="${id}-email">Email</label><input id="${id}-email" name="email" type="email" autocomplete="email" required></div>` +
    `<div class="pb-field"><label for="${id}-message">Message</label><textarea id="${id}-message" name="message" rows="5" required></textarea></div>` +
    // Honeypot: hidden from people, filled by bots.
    `<div class="pb-hp" aria-hidden="true"><label for="${id}-company">Company</label><input id="${id}-company" name="_gotcha" tabindex="-1" autocomplete="off"></div>` +
    `<button type="submit" class="pb-btn pb-btn--primary">Send message</button>` +
    `<p class="pb-form-status" role="status" aria-live="polite"></p>` +
    `</form>`
  );
}

export const contact: SectionRenderer = {
  emptyHint: 'Add your email, social links or a form service in Content → Contact.',
  hasContent: (s) =>
    !!s.content.profile.email.trim() ||
    s.content.profile.socials.some((x) => x.url.trim()) ||
    (s.contactForm.service === 'link' && !!s.contactForm.value.trim()) ||
    !!formTarget(s.contactForm),
  render(ctx) {
    const v = ctx.section.variant;
    const lead =
      typeof ctx.section.options['lead'] === 'string'
        ? (ctx.section.options['lead'] as string)
        : '';
    const leadHtml = `<p class="pb-contact-lead"${ctx.editOption('lead')}>${esc(lead || "I'm always happy to talk about new projects and ideas.")}</p>`;
    if (v === 'form') {
      return wrap(
        ctx,
        `<div class="pb-contact-grid"><div class="pb-reveal">${leadHtml}${links(ctx)}</div><div class="pb-reveal">${form(ctx)}</div></div>`,
      );
    }
    if (v === 'cta') {
      const email = ctx.state.content.profile.email;
      const main = email
        ? `<p><a class="pb-btn pb-btn--primary pb-btn--lg" href="${esc(safeUrl('mailto:' + email))}">Say hello</a></p>`
        : form(ctx);
      return wrap(
        ctx,
        `<div class="pb-contact-cta pb-reveal">${leadHtml}${main}${links(ctx)}</div>`,
        { extraClass: 'pb-narrow' },
      );
    }
    return wrap(ctx, `<div class="pb-reveal">${leadHtml}${links(ctx)}${form(ctx)}</div>`, {
      extraClass: 'pb-narrow',
    });
  },
};
