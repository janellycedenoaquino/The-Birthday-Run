import { ImageResponse } from "next/og";
import { BrandMark } from "./brand-image";

// /apple-icon (BUILD F-3, FR-25): the home-screen icon on iOS: the doll on a full pink square, since
// iOS rounds the corners itself and shows transparent ones as black (decision 0016).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    await BrandMark({ size: 180, shape: "square" }),
    size,
  );
}
