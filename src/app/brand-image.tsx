import { appConfig } from "@/config/app";

// The generated brand mark for the icons (BUILD F-3): the app's first letter on the brand colour.
// Plain JSX for next/og's ImageResponse (inline styles are its only styling, and it renders to a
// PNG on the server, so the CSP doesn't apply).
export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: appConfig.brand.primary,
        color: appConfig.brand.primaryForeground,
        fontSize: size * 0.55,
        fontWeight: 600,
        borderRadius: size * 0.22,
      }}
    >
      {appConfig.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
