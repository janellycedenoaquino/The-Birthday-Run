import { LoadingPicture } from "@/components/layout/loading-picture";
import { msg } from "@/lib/messages";

// C-3 loading state for the signed-in area (SPEC §3.2; look: decision 0016): three pastel dots
// that bounce in turn, still under reduced motion, under one of the owner's four pictures.
export default function Loading() {
  return (
    <div
      className="grid min-h-[50vh] place-items-center"
      aria-busy="true"
      role="status"
    >
      <span className="sr-only">{msg("M-315")}</span>
      <span aria-hidden="true" className="grid justify-items-center gap-5">
        <LoadingPicture />
        <span className="flex gap-1.5">
          {["var(--bubblegum)", "var(--primary)", "var(--spring)"].map(
            (color, i) => (
              <i
                key={color}
                style={{ background: color, animationDelay: `${i * 0.15}s` }}
                className="size-2.5 rounded-full motion-safe:animate-[dot-bounce_1s_ease-in-out_infinite]"
              />
            ),
          )}
        </span>
      </span>
    </div>
  );
}
