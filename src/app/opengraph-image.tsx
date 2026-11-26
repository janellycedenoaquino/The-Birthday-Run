import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { appConfig } from "@/config/app";
import { msg } from "@/lib/messages";
import { fitInside, logoSize } from "@/lib/og/logo-size";
import { SHARE_BRANDS } from "@/lib/og/share-brands";
import { getSiteUrl } from "@/server/site-url";

// /opengraph-image (BUILD F-3, FR-24): the link preview, 1200×630, in the landing page's look
// (decision 0016; owner's pick "A", 2026-11-26): the headline with its pink block on the pastel
// glow, a tilted wall of well-known brands' logo cards, and the doll mark with the name and domain.
// Built once at build time. next/og draws inline styles only (flexbox, no CSS classes).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${appConfig.name}: ${msg("M-282").replace(/\n/g, " ")} ${msg("M-282b").replace(/\n/g, " ")}`;

// Decision 0016's colours (globals.css): navy text, bubblegum block, cream page, three glows.
const NAVY = appConfig.brand.primaryForeground;
const MUTED = "#4c557d";
const BUBBLEGUM = "#ff9ec4";
const CREAM = "#fffcf7";
// Each glow fades to its own colour at alpha 0: next/og fades "transparent" through black (grey).
const glow = (rgb: string, size: string, at: string) =>
  `radial-gradient(${size} at ${at}, rgba(${rgb},1) 0%, rgba(${rgb},0) 70%)`;
const GLOWS = [
  glow("255,214,229", "520px 520px", "8% 12%"),
  glow("214,235,255", "560px 560px", "95% 15%"),
  glow("211,245,225", "640px 520px", "50% 110%"),
].join(", ");

const CARD = { width: 170, height: 96 };
const LOGO_BOX = { width: CARD.width - 40, height: CARD.height - 36 };

// Every path is a fixed folder under the project (Next's "local assets" pattern), so the build
// traces only those folders, not the whole project.
export default async function OpengraphImage() {
  const [bold, semi, doll, logos] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/plus-jakarta-sans-800.woff")),
    readFile(join(process.cwd(), "assets/fonts/plus-jakarta-sans-600.woff")),
    readFile(join(process.cwd(), "public/brand/doll-head.png"), "base64").then(
      (b64) => `data:image/png;base64,${b64}`,
    ),
    Promise.all(
      SHARE_BRANDS.map(async ({ logoFile }) => {
        const bytes = await readFile(
          join(process.cwd(), "public/retailers", logoFile),
        );
        const svg = logoFile.endsWith(".svg");
        return {
          src: `data:${svg ? "image/svg+xml" : "image/png"};base64,${bytes.toString("base64")}`,
          ...fitInside(logoSize(logoFile, bytes), LOGO_BOX),
        };
      }),
    ),
  ]);
  const domain = new URL(getSiteUrl()).host.replace(/^www\./, "");
  const columns = [logos.slice(0, 7), logos.slice(7)];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: CREAM,
        backgroundImage: GLOWS,
        padding: "60px 0 56px 72px",
        overflow: "hidden",
        fontFamily: "Jakarta",
        color: NAVY,
      }}
    >
      <div
        style={{
          width: 690,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // Lower than the frame's top (owner, 2026-11-26): even space above it and down to the mark.
            marginTop: 70,
            fontSize: 74,
            fontWeight: 800,
            lineHeight: 1.06,
            letterSpacing: "-0.035em",
          }}
        >
          <div style={{ display: "flex", width: 640 }}>
            {msg("M-282").replace(/\n/g, " ")}
          </div>
          <div style={{ display: "flex", marginTop: 10 }}>
            <div
              style={{
                background: BUBBLEGUM,
                borderRadius: 8,
                padding: "0 14px",
                transform: "rotate(-2deg)",
              }}
            >
              {msg("M-282b").replace(/\n/g, " ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              background: "#ffd6e5",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img src={doll} width={60} height={60} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>
              {appConfig.name}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>
              {domain}
            </div>
          </div>
        </div>
      </div>
      {/* The tilted wall (decision 0016's -8°). Logos are background images: next/og clips an
          <img> inside a rotated box. */}
      <div
        style={{
          display: "flex",
          gap: 22,
          marginTop: -36,
          transform: "rotate(-8deg)",
        }}
      >
        {columns.map((column, c) => (
          <div
            key={c}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              // Each column starts one card above the frame, so its first card is cut off; the right one
              // sits lower, like the landing wall's staggered rows.
              marginTop: (c ? 56 : 0) - (CARD.height + 18),
            }}
          >
            {column.map((logo, i) => (
              <div
                key={i}
                style={{
                  ...CARD,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "white",
                  borderRadius: 20,
                  boxShadow:
                    "0 0 0 2px rgba(31,42,92,0.16), 0 14px 28px -14px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    width: logo.width,
                    height: logo.height,
                    display: "flex",
                    backgroundImage: `url(${logo.src})`,
                    backgroundSize: `${logo.width}px ${logo.height}px`,
                    backgroundRepeat: "no-repeat",
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Jakarta", data: bold, weight: 800, style: "normal" },
        { name: "Jakarta", data: semi, weight: 600, style: "normal" },
      ],
    },
  );
}
