import { ImageResponse } from "next/og";
import { BrandMark } from "./brand-image";

// /apple-icon (BUILD F-3, FR-25): the home-screen icon on iOS.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} />, size);
}
