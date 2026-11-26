import Image from "next/image";

// The owner's illustrations (decision 0016), recoloured to the bright party palette and kept in
// public/illustrations/ as WebP. They're decoration: the page's text says everything, so alt="".
// The presents show real brand logos, so they're for signed-in pages only (never public ones).
export const ILLUSTRATIONS = {
  girlsRunning: { src: "/illustrations/girls-running.webp", w: 1200, h: 670 },
  girlsMap: { src: "/illustrations/girls-map.webp", w: 1059, h: 992 },
  jumpRope: { src: "/illustrations/jump-rope.webp", w: 1200, h: 670 },
  presents: { src: "/illustrations/presents.webp", w: 912, h: 1176 },
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export function Illustration({
  name,
  className = "",
  eager = false,
}: {
  name: IllustrationName;
  className?: string;
  /** Above the fold on a page that is only this picture and a few lines (404, S-8, loading). */
  eager?: boolean;
}) {
  const art = ILLUSTRATIONS[name];
  return (
    <Image
      src={art.src}
      width={art.w}
      height={art.h}
      alt=""
      loading={eager ? "eager" : "lazy"}
      sizes="(max-width: 640px) 90vw, 640px"
      className={`h-auto w-full rounded-2xl object-contain ${className}`}
    />
  );
}
