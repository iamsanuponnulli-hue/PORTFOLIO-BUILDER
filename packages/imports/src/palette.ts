/**
 * Main colours of an image (an uploaded screenshot of a site someone likes), so
 * inspiration works even without the extension or a model that can see images.
 */

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Buckets RGBA pixels (5 bits per channel), then merges near-identical buckets.
 * Returns up to `count` colours, most used first.
 */
export function paletteFromPixels(data: Uint8ClampedArray | Uint8Array, count = 6): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    s.n++;
    s.r += r;
    s.g += g;
    s.b += b;
    buckets.set(key, s);
  }
  const colors = [...buckets.values()]
    .map((s) => ({ n: s.n, r: s.r / s.n, g: s.g / s.n, b: s.b / s.n }))
    .sort((a, b) => b.n - a.n);
  const picked: typeof colors = [];
  for (const c of colors) {
    const near = picked.find((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < 48);
    if (near) {
      near.n += c.n;
      continue;
    }
    picked.push({ ...c });
    if (picked.length >= count * 3) break;
  }
  return picked
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((c) => hex(c.r, c.g, c.b));
}

/** Palette of an image file, read with OffscreenCanvas (page or worker). */
export async function paletteFromImage(file: Blob, count = 6): Promise<string[]> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 200 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return paletteFromPixels(ctx.getImageData(0, 0, w, h).data, count);
}
