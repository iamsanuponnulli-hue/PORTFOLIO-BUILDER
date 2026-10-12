/**
 * Image processing on the user's computer (runs in a Web Worker): resize, re-encode
 * to WebP (JPEG where the browser can't write WebP) and drop EXIF metadata such as
 * GPS location, which re-encoding removes.
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Widths to keep for responsive images: never upscale, always keep the largest. */
export function variantWidths(width: number, wanted: number[] = [480, 960, 1600]): number[] {
  const out = wanted.filter((w) => w < width);
  out.push(Math.min(width, wanted[wanted.length - 1]!));
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface ProcessedImage {
  width: number;
  height: number;
  mediaType: string;
  /** Largest variant. */
  blob: Blob;
  variants: Record<number, Blob>;
}

async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
  if (webp.type === 'image/webp') return webp;
  return canvas.convertToBlob({ type: 'image/jpeg', quality }); // e.g. older Safari
}

export async function processImage(
  file: Blob,
  opts: { widths?: number[]; quality?: number } = {},
): Promise<ProcessedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('This image is larger than 15 MB.');
  if (!/^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/.test(file.type))
    throw new Error('Use a PNG, JPEG, WebP or GIF image.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("This image couldn't be opened. Try saving it as PNG or JPEG.");
  }
  const variants: Record<number, Blob> = {};
  let mediaType = 'image/webp';
  for (const w of variantWidths(bitmap.width, opts.widths)) {
    const h = Math.round((bitmap.height * w) / bitmap.width);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await encode(canvas, opts.quality ?? 0.82);
    mediaType = blob.type;
    variants[w] = blob;
  }
  const largest = Math.max(...Object.keys(variants).map(Number));
  const result = {
    width: largest,
    height: Math.round((bitmap.height * largest) / bitmap.width),
    mediaType,
    blob: variants[largest]!,
    variants,
  };
  bitmap.close();
  return result;
}
