/** Packs PNG images into one .ico file (PNG-in-ICO, supported by every current browser). */
export function pngsToIco(images: { size: number; png: Uint8Array }[]): Uint8Array {
  const header = 6;
  const entry = 16;
  let offset = header + entry * images.length;
  const total = offset + images.reduce((n, i) => n + i.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // icon
  view.setUint16(4, images.length, true);
  images.forEach((im, i) => {
    const at = header + entry * i;
    view.setUint8(at, im.size >= 256 ? 0 : im.size);
    view.setUint8(at + 1, im.size >= 256 ? 0 : im.size);
    view.setUint8(at + 2, 0);
    view.setUint8(at + 3, 0);
    view.setUint16(at + 4, 1, true);
    view.setUint16(at + 6, 32, true);
    view.setUint32(at + 8, im.png.length, true);
    view.setUint32(at + 12, offset, true);
    out.set(im.png, offset);
    offset += im.png.length;
  });
  return out;
}
