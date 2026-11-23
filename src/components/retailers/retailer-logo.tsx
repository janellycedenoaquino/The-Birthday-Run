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
}: {
  name: string;
  logoFile: string | null;
  size?: number;
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
