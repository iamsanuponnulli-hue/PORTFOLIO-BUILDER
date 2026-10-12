import { esc } from '../html.ts';
import { wrap, type SectionRenderer } from './shared.ts';

export const testimonials: SectionRenderer = {
  emptyHint: 'Add quotes from colleagues or clients in Content → Testimonials.',
  hasContent: (s) => s.content.testimonials.length > 0,
  render(ctx) {
    const v = ctx.section.variant;
    const items = ctx.state.content.testimonials
      .map((t) => {
        const base = `testimonials.${t.id}`;
        return (
          `<li class="pb-quote${v === 'grid' ? ' pb-card' : ''} pb-reveal"><figure>` +
          `<blockquote${ctx.edit(`${base}.quote`)}><p>${esc(t.quote)}</p></blockquote>` +
          `<figcaption><span class="pb-quote-author"${ctx.edit(`${base}.author`)}>${esc(t.author)}</span>` +
          (t.role ? `<span class="pb-meta"${ctx.edit(`${base}.role`)}>${esc(t.role)}</span>` : '') +
          `</figcaption></figure></li>`
        );
      })
      .join('');
    return wrap(ctx, `<ul class="pb-quotes pb-quotes--${esc(v)}" role="list">${items}</ul>`);
  },
};
