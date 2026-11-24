import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The brand mark for the icons (BUILD F-3, decision 0016): the owner's doll (afro, purple party
// hat) on the pink circle. Plain JSX for next/og's ImageResponse (inline styles are its only
// styling, and it renders to a PNG on the server, so the CSP doesn't apply). The head is a local
// file, read once per server (Next's "local assets" pattern).
const head = readFile(
  join(process.cwd(), "public/brand/doll-head.png"),
  "base64",
).then((b64) => `data:image/png;base64,${b64}`);

/** `circle`: the favicon and app icons. `square`: iOS home screen (it rounds the corners itself). */
export async function BrandMark({
  size,
  shape = "circle",
}: {
  size: number;
  shape?: "circle" | "square";
}) {
  const src = await head;
  const inner = Math.round(size * 0.92);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: "#FFD6E5",
        borderRadius: shape === "circle" ? size / 2 : 0,
        overflow: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> only */}
      <img
        src={src}
        width={inner}
        height={inner}
        alt=""
        style={{ marginBottom: -Math.round(size * 0.02) }}
      />
    </div>
  );
}
