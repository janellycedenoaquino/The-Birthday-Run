import Link from "next/link";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { EnrollToggle } from "./enroll-toggle";
import { RetailerLogo } from "./retailer-logo";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export type CardRetailer = {
  id: string;
  name: string;
  category: string;
  reward_description: string;
  reward_type: string;
  logo_file: string | null;
  /** "Needs a purchase" on the card (decision 0016); left out where the card isn't shown. */
  requires_purchase?: boolean;
};

// C-102 Retailer card (SPEC §3.3; look: decision 0016). A logo card: hovering or focusing it shows
// the brand, the reward and "Needs a purchase" when true; phones have no hover, so touch screens
// and narrow screens always show them under the logo. No timing line and no category tag. The
// whole card links to S-104. Signed in, a "+" toggle sits in the corner (outside the link) and a
// pink "Added" ribbon marks the brands the user is in.
export function RetailerCard({
  retailer: r,
  toggle,
}: {
  retailer: CardRetailer;
  toggle?: { enrolled: boolean; enroll: Action; unenroll: Action };
}) {
  return (
    <li className="group relative rounded-[18px] bg-white/80 shadow-[0_0_0_1.5px_var(--border)] transition-shadow focus-within:shadow-[0_0_0_3px_var(--spring),0_16px_30px_-14px_rgb(0_0_0/25%)] hover:shadow-[0_0_0_3px_var(--spring),0_16px_30px_-14px_rgb(0_0_0/25%)] dark:bg-white/10">
      <Link
        href={`/discover/${r.id}`}
        className="relative block h-[150px] rounded-[18px] outline-none max-sm:h-auto [@media(hover:none)]:h-auto"
      >
        <span className="flex h-full items-center justify-center p-3.5 max-sm:h-[86px] [@media(hover:none)]:h-[86px]">
          <RetailerLogo name={r.name} logoFile={r.logo_file} size={64} wide />
        </span>
        <span className="absolute inset-0 flex flex-col justify-center rounded-[18px] bg-background/95 p-4 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:static max-sm:bg-transparent max-sm:px-3.5 max-sm:pt-0 max-sm:pb-3.5 max-sm:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:bg-transparent [@media(hover:none)]:px-3.5 [@media(hover:none)]:pt-0 [@media(hover:none)]:pb-3.5 [@media(hover:none)]:opacity-100">
          <h3 className="text-[13px] font-bold text-muted-foreground">
            {r.name}
          </h3>
          <span className="mt-0.5 text-[17px] leading-tight font-extrabold tracking-[-0.015em] max-sm:text-[15px]">
            {r.reward_description}
          </span>
          {r.requires_purchase ? (
            <span className="mt-1 text-xs text-muted-foreground">
              {msg("M-296")}
            </span>
          ) : null}
        </span>
      </Link>
      {toggle?.enrolled ? (
        <span className="pointer-events-none absolute top-3 -left-1.5 z-[2] rounded-r-lg bg-[var(--bubblegum)] py-1 pr-2.5 pl-3 text-xs font-extrabold text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)]">
          {msg("M-104")}
        </span>
      ) : null}
      {toggle ? (
        <div className="absolute right-2.5 bottom-2.5 z-[3]">
          <EnrollToggle
            retailerId={r.id}
            name={r.name}
            enrolled={toggle.enrolled}
            enroll={toggle.enroll}
            unenroll={toggle.unenroll}
            compact
          />
        </div>
      ) : null}
    </li>
  );
}
