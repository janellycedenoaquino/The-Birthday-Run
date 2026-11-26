// Logo sizes for the share card (src/app/opengraph-image.tsx). next/og's renderer doesn't scale
// images to max-width/max-height the way browsers do, so each logo gets an exact size from its
// own proportions: a PNG's header, or an SVG's viewBox.

/** A logo file's natural width and height. Throws on a file it can't read a size from. */
export function logoSize(file: string, bytes: Uint8Array): [number, number] {
  if (file.endsWith(".png")) {
    // PNG: 8-byte signature, then the IHDR chunk; width and height are big-endian at 16 and 20.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 24 || view.getUint32(12) !== 0x49484452)
      throw new Error(`logoSize: ${file} is not a PNG`);
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (file.endsWith(".svg")) {
    const text = new TextDecoder().decode(bytes);
    const box = /viewBox\s*=\s*["']([^"']+)["']/.exec(text)?.[1];
    const [, , w, h] = (box ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (!(w > 0 && h > 0)) throw new Error(`logoSize: ${file} has no viewBox`);
    return [w, h];
  }
  throw new Error(`logoSize: ${file} is not a PNG or SVG`);
}

/** The largest size with the logo's proportions that fits inside `box` (whole pixels). */
export function fitInside(
  [w, h]: [number, number],
  box: { width: number; height: number },
): { width: number; height: number } {
  const k = Math.min(box.width / w, box.height / h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
