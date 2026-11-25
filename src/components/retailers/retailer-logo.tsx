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
}: {
  name: string;
  logoFile: string | null;
  size?: number;
  /** Discover's logo card (decision 0016): up to 150 × 56, no tile behind it. */
  wide?: boolean;
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
        width={150}
        height={56}
        onError={() => setFailed(true)}
        className="h-14 w-auto max-w-[150px] object-contain"
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
