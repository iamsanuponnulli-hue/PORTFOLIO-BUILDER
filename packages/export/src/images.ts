import { readableOn, type SiteState } from '@pb/renderer';
import { pngsToIco } from './ico.ts';

/** Canvas drawing for the favicon and the share image (page or worker). */

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join('') || 'P';

const colors = (state: SiteState) => {
  const t = state.spec.theme;
  return t.colorMode === 'dark' ? t.colors.dark : t.colors.light;
};

async function png(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** favicon.ico: the photo in a circle, or initials on the primary colour. */
export async function drawFavicon(state: SiteState, photo?: Blob): Promise<Uint8Array> {
  const c = colors(state);
  const bitmap = photo ? await createImageBitmap(photo).catch(() => undefined) : undefined;
  const sizes = [16, 32, 48];
  const pngs = [];
  for (const size of sizes) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    if (bitmap) {
      ctx.save();
      ctx.clip();
      const s = Math.min(bitmap.width, bitmap.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - s) / 2,
        (bitmap.height - s) / 2,
        s,
        s,
        0,
        0,
        size,
        size,
      );
      ctx.restore();
    } else {
      ctx.fillStyle = c.primary;
      ctx.fill();
      ctx.fillStyle = readableOn(c.primary);
      const text = initials(state.content.profile.name);
      ctx.font = `700 ${Math.round(size * (text.length > 1 ? 0.42 : 0.55))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, size / 2, size / 2 + size * 0.03);
    }
    pngs.push({ size, png: await png(canvas) });
  }
  bitmap?.close();
  return pngsToIco(pngs);
}

function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** og-image.png (1200×630): name and headline in the site's colours, shown when the link is shared. */
export async function drawOgImage(state: SiteState): Promise<Uint8Array> {
  const c = colors(state);
  const p = state.content.profile;
  const canvas = new OffscreenCanvas(1200, 630);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, 24, 630);
  ctx.fillStyle = c.text;
  ctx.font = '800 76px system-ui, sans-serif';
  const nameLines = wrapText(ctx, p.name || 'Portfolio', 1000).slice(0, 2);
  let y = 230;
  for (const l of nameLines) {
    ctx.fillText(l, 100, y);
    y += 88;
  }
  ctx.fillStyle = c.muted;
  ctx.font = '500 40px system-ui, sans-serif';
  for (const l of wrapText(ctx, p.headline || p.tagline, 1000).slice(0, 2)) {
    ctx.fillText(l, 100, y + 10);
    y += 54;
  }
  ctx.fillStyle = c.primary;
  ctx.font = '600 30px system-ui, sans-serif';
  const url = state.spec.seo.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (url) ctx.fillText(url, 100, 560);
  return png(canvas);
}
