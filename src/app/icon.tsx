import { ImageResponse } from "next/og";
import { BrandMark } from "./brand-image";

// /icon (BUILD F-3, FR-25): the favicon and the manifest's 192/512 px icons, in the brand colour.
export const contentType = "image/png";
const SIZES = [32, 192, 512];

export async function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType,
  }));
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(<BrandMark size={size} />, {
    width: size,
    height: size,
  });
}
