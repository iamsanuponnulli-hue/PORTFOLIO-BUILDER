import { esc } from '../html.ts';
import { dateRange, tagList, wrap, type Ctx, type SectionRenderer } from './shared.ts';

function item(
  ctx: Ctx,
  e: Ctx['state']['content']['experience'][number],
  compact: boolean,
): string {
  const base = `experience.${e.id}`;
  const bullets =
    !compact && e.bullets.length
      ? `<ul class="pb-bullets">${e.bullets.map((b, i) => `<li${ctx.edit(`${base}.bullets.${i}`)}>${esc(b)}</li>`).join('')}</ul>`
      : '';
  return (
    `<li class="pb-exp pb-reveal">` +
    `<div class="pb-exp-head">` +
    `<h3 class="pb-exp-role"><span${ctx.edit(`${base}.role`)}>${esc(e.role)}</span>` +
    ` <span class="pb-exp-at">at</span> <span${ctx.edit(`${base}.company`)}>${esc(e.company)}</span></h3>` +
    `<p class="pb-meta">${dateRange(e.start, e.end)}${e.location ? ` · ${esc(e.location)}` : ''}</p>` +
    `</div>` +
    bullets +
    (compact ? '' : tagList(e.tech)) +
    `</li>`
  );
}

export const experience: SectionRenderer = {
  emptyHint: 'Add roles in Content → Experience, or import your resume.',
  hasContent: (s) => s.content.experience.length > 0,
  render(ctx) {
    const v = ctx.section.variant;
    const items = ctx.state.content.experience.map((e) => item(ctx, e, v === 'compact')).join('');
    return wrap(ctx, `<ol class="pb-exp-list pb-exp-list--${esc(v)}" role="list">${items}</ol>`);
  },
};
