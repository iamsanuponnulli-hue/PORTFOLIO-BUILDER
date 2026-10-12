import { esc } from '../html.ts';
import { img, wrap, type SectionRenderer } from './shared.ts';

/** Shows every project image, each opening full size in a lightbox. */
export const gallery: SectionRenderer = {
  emptyHint: 'Add images to your projects to fill the gallery.',
  hasContent: (s) => s.content.projects.some((p) => p.images.length > 0),
  render(ctx) {
    const assets = ctx.opts.assets ?? {};
    const shots = ctx.state.content.projects.flatMap((p) => p.images.map((im) => ({ p, im })));
    const usesLightbox = shots.some(({ im }) => assets[im.assetId]);
    if (usesLightbox) ctx.use('lightbox');
    const items = shots
      .map(({ p, im }) => {
        const a = assets[im.assetId];
        const inner = img(ctx, im, {
          className: 'pb-gallery-img',
          placeholder: p.title,
          sizes: '(max-width: 700px) 100vw, 33vw',
        });
        const caption = `<figcaption>${esc(im.alt || p.title)}</figcaption>`;
        return a
          ? `<li class="pb-reveal"><figure><a href="${esc(a.src)}" data-pb-lightbox aria-label="Open image: ${esc(im.alt || p.title)}">${inner}</a>${caption}</figure></li>`
          : `<li class="pb-reveal"><figure>${inner}${caption}</figure></li>`;
      })
      .join('');
    return wrap(
      ctx,
      `<ul class="pb-gallery pb-gallery--${esc(ctx.section.variant)}" role="list">${items}</ul>`,
    );
  },
};
