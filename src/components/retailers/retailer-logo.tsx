"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsOf } from "@/lib/retailers/labels";

// C-102's logo: the file from public/retailers/ (never hotlinked, A-16), or the name's initials
// on the muted colour when there's no file or it fails to load.
export function RetailerLogo({
  name,
  logoFile,
  size = 48,
  wide = false,
  large = false,
}: {
  name: string;
  logoFile: string | null;
  size?: number;
  /** Discover's logo card (decision 0016): up to 150 × 56, no tile behind it. */
  wide?: boolean;
  /** With `wide`: the brand page's bigger logo, up to 170 × 80 (decision 0016 prototype). */
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!logoFile || failed)
    return (
      <span
        aria-hidden="true"
        style={box}
        className="flex shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold text-muted-foreground"
      >
        {initialsOf(name)}
      </span>
    );
  if (wide)
    return (
      <Image
        src={`/retailers/${logoFile}`}
        alt={name}
        width={large ? 170 : 150}
        height={large ? 80 : 56}
        onError={() => setFailed(true)}
        className={
          large
            ? "h-20 w-auto max-w-[170px] object-contain"
            : "h-14 w-auto max-w-[150px] object-contain"
        }
      />
    );
  return (
    <Image
      src={`/retailers/${logoFile}`}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md bg-white object-contain p-1"
      style={box}
    />
  );
}
