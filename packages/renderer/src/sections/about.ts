import { paragraphs } from '../html.ts';
import { avatar, wrap, type SectionRenderer } from './shared.ts';

export const about: SectionRenderer = {
  emptyHint: 'Write a short bio in Content → Profile.',
  hasContent: (s) => s.content.profile.bio.trim().length > 0,
  render(ctx) {
    const bio = `<div class="pb-prose pb-reveal"${ctx.edit('profile.bio')}>${paragraphs(ctx.state.content.profile.bio)}</div>`;
    const photo = ctx.section.variant === 'photo' ? avatar(ctx, 'pb-about-photo') : '';
    if (photo) return wrap(ctx, `<div class="pb-about-grid">${photo}${bio}</div>`);
    return wrap(ctx, bio, { extraClass: 'pb-narrow' });
  },
};
