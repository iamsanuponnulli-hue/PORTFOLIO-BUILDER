import { esc } from '../html.ts';
import { wrap, type SectionRenderer } from './shared.ts';

export const skills: SectionRenderer = {
  emptyHint: 'Add skill groups in Content → Skills.',
  hasContent: (s) => s.content.skills.some((g) => g.items.length > 0),
  render(ctx) {
    const groups = ctx.state.content.skills.filter((g) => g.items.length);
    if (ctx.section.variant === 'columns') {
      return wrap(
        ctx,
        `<div class="pb-skill-cols">${groups
          .map(
            (g, gi) =>
              `<div class="pb-skill-col pb-reveal"><h3${ctx.edit(`skills.${gi}.group`)}>${esc(g.group)}</h3><ul role="list">${g.items
                .map((s) => `<li>${esc(s)}</li>`)
                .join('')}</ul></div>`,
          )
          .join('')}</div>`,
      );
    }
    return wrap(
      ctx,
      groups
        .map(
          (g, gi) =>
            `<div class="pb-skill-group pb-reveal">${groups.length > 1 ? `<h3${ctx.edit(`skills.${gi}.group`)}>${esc(g.group)}</h3>` : ''}<ul class="pb-tags pb-tags--lg" role="list">${g.items
              .map((s) => `<li class="pb-tag">${esc(s)}</li>`)
              .join('')}</ul></div>`,
        )
        .join(''),
    );
  },
};
