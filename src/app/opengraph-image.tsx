import { ImageResponse } from "next/og";
import { appConfig } from "@/config/app";

// /opengraph-image (BUILD F-3, FR-24): link previews, 1200×630, from the config file.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = appConfig.name;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "white",
        borderTop: `24px solid ${appConfig.brand.primary}`,
      }}
    >
      <div style={{ fontSize: 72, fontWeight: 700, color: "#1a1f1d" }}>
        {appConfig.name}
      </div>
      <div style={{ marginTop: 24, fontSize: 36, color: "#57605c" }}>
        {appConfig.description}
      </div>
    </div>,
    size,
  );
}
