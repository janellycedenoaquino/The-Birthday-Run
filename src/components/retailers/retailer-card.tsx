import Link from "next/link";
import type { ActionResult } from "@/lib/action-result";
import { CATEGORY_LABELS, REWARD_TYPE_LABELS } from "@/lib/retailers/labels";
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
};

// C-102 Retailer card (SPEC §3.3): logo or initials, name, category, reward and its type; the
// name links to S-104. Signed in, the enroll toggle sits below (outside the link).
export function RetailerCard({
  retailer: r,
  toggle,
}: {
  retailer: CardRetailer;
  toggle?: { enrolled: boolean; enroll: Action; unenroll: Action };
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border/70 p-4">
      <div className="flex items-start gap-3">
        <RetailerLogo name={r.name} logoFile={r.logo_file} />
        <div className="min-w-0">
          <h3 className="font-semibold">
            <Link
              href={`/discover/${r.id}`}
              className="underline-offset-4 hover:underline"
            >
              {r.name}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[r.category]}
          </p>
        </div>
      </div>
      <p>{r.reward_description}</p>
      <p className="text-sm text-muted-foreground">
        {REWARD_TYPE_LABELS[r.reward_type]?.label}
      </p>
      {toggle ? (
        <div className="mt-auto">
          <EnrollToggle
            retailerId={r.id}
            name={r.name}
            enrolled={toggle.enrolled}
            enroll={toggle.enroll}
            unenroll={toggle.unenroll}
          />
        </div>
      ) : null}
    </li>
  );
}
