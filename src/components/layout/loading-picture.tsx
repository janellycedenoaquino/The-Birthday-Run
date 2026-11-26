"use client";

import { useEffect, useState } from "react";
import {
  Illustration,
  type IllustrationName,
} from "@/components/layout/illustration";

// The loading screen's picture (decision 0016): one of four, a different one each time. Chosen
// after mount, so the server's HTML and the first client render match (no hydration mismatch);
// the dots show on their own until then. Signed-in pages only: the presents show real logos.
const PICTURES: IllustrationName[] = [
  "girlsRunning",
  "girlsMap",
  "presents",
  "jumpRope",
];

export function LoadingPicture() {
  const [name, setName] = useState<IllustrationName | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a random pick must wait for the client
    setName(PICTURES[Math.floor(Math.random() * PICTURES.length)]!);
  }, []);
  return name ? (
    <div className="w-64 max-w-[70vw]">
      <Illustration name={name} eager />
    </div>
  ) : null;
}
