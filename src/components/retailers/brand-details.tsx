import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { cn } from "cn";
import { EnrollToggle } from "@/components/retailers/enroll-toggle";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { ReportDialog } from "@/components/rewards/report-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { formatDate, timingOf, type LocalDate } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import {
  CATEGORY_LABELS,
  REWARD_TYPE_LABELS,
  timingLabel,
} from "@/lib/retailers/labels";
import { enroll, unenroll } from "@/server/actions/enrollments";
import { reportReward } from "@/server/actions/reports";
import type { Brand } from "@/server/catalog/brand";

// S-104's content (SPEC §3.3; look: decision 0016). `page`: the full page search engines and
// shared links open (breadcrumb, the logo on a side panel in the category colour, the visitor
// band and 4 more brands from the category). `sheet`: Discover's pop-up, the same facts stacked.
// The general timing rule stays public (decision 0017); only an account knows the user's dates.

const FACT =
  "rounded-[20px] bg-white/80 p-4 shadow-[0_0_0_1.5px_var(--border)] dark:bg-white/5";
const FACT_TITLE =
  "mb-2 text-xs font-extrabold tracking-[0.12em] text-muted-foreground uppercase";
const BIG = "text-xl leading-tight font-extrabold tracking-[-0.02em]";
const COLUMNS: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
};
const LINK =
  "font-bold underline decoration-[var(--bubblegum)] decoration-[3px] underline-offset-[3px]";

export function BrandDetails({
  brand,
  variant,
}: {
  brand: Brand;
  variant: "page" | "sheet";
}) {
  const { retailer: r, signedIn, enrolled, joinBy, dates, reported } = brand;
  const category = CATEGORY_LABELS[r.category] ?? r.category;
  const type = REWARD_TYPE_LABELS[r.reward_type];
  const signUpHref = `/sign-up?next=${encodeURIComponent(`/discover/${r.id}`)}`;
  // Each requirement as its bold label ("Membership:") and the text (decision 0016 prototype).
  const needs = (
    [
      ["M-189a", r.purchase_requirement],
      ["M-189b", r.membership_requirement],
      ["M-189c", r.other_requirement],
    ] as const
  ).flatMap(([id, text]) =>
    text ? [{ label: msg(id).split("{text}")[0]!.trim(), text }] : [],
  );
  const page = variant === "page";
  // When, then Join (visitors: only with a waiting period), then What you need (signed in).
  const factCount =
    1 + (r.signup_lead_days || signedIn ? 1 : 0) + (signedIn ? 1 : 0);

  return (
    <div>
      {/* The full page's way back (owner, 2026-11-25): the breadcrumb on phones, a back arrow on
          wider screens. The pop-up has neither: it closes with its X or a click outside. */}
      {page ? (
        <>
          <nav
            aria-label="Breadcrumb"
            className="mt-1.5 mb-3.5 text-sm text-muted-foreground sm:hidden"
          >
            <Link href="/discover" className={LINK}>
              {msg("M-171a")}
            </Link>{" "}
            / {category} / {r.name}
          </nav>
          <Link
            href="/discover"
            className="mt-1.5 mb-3.5 hidden items-center gap-1.5 rounded-[10px] text-sm font-bold text-[var(--navy)] outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex dark:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {msg("M-171c")}
          </Link>
        </>
      ) : null}

      <section
        style={{ "--cc": `var(--cat-${r.category})` } as React.CSSProperties}
        className={
          page
            ? "frosted grid overflow-hidden rounded-[28px] md:grid-cols-[300px_1fr]"
            : undefined
        }
      >
        <div
          className={`flex flex-col items-center justify-center bg-[var(--cc)] text-center text-[var(--navy)] ${page ? "border-b-[1.5px] border-border p-7 md:border-r-[1.5px] md:border-b-0" : "rounded-[22px] p-5"}`}
        >
          <div className="grid h-[130px] w-[200px] place-items-center rounded-[22px] bg-white shadow-[0_0_0_1.5px_var(--border)]">
            <RetailerLogo name={r.name} logoFile={r.logo_file} wide large />
          </div>
          {page ? (
            <h1 className="headline mt-4 text-[30px] leading-[1.08]">
              {/* "{brand} birthday reward": what people search for (owner, 2026-11-25). */}
              {msg("M-298").replace("{brand}", r.name)}
            </h1>
          ) : (
            // The pop-up's own title, so the dialog is named by it.
            <DialogTitle
              asChild
              className="headline mt-4 text-[30px] leading-[1.08] font-extrabold"
            >
              <h2>{r.name}</h2>
            </DialogTitle>
          )}
          {/* No description line or category tag: both repeated what's around them, the same on
              every brand page (owner, 2026-11-25). */}
        </div>
        <div className={page ? "px-7 py-7 sm:px-8" : "pt-5"}>
          <small className="text-xs font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
            {msg("M-298a")}
          </small>
          <strong className="mt-1.5 block text-[26px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[30px]">
            {r.reward_description}
          </strong>
          {/* The type as a short tag; "no purchase needed" helps people decide (owner). */}
          {type ? (
            <span className="mt-2.5 inline-block rounded-[9px] bg-white/70 px-2.5 py-1 text-xs font-extrabold text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--border)] dark:bg-white/10 dark:text-foreground">
              {type.note ? `${type.label} · ${type.note}` : type.label}
            </span>
          ) : null}
          <div className="mt-[18px] flex flex-wrap items-start gap-2.5">
            {/* Signed out, no sign-up button here: the dates card and the band below have one
                each, and three on a page is too many (owner, 2026-11-25). */}
            {signedIn ? (
              <EnrollToggle
                retailerId={r.id}
                name={r.name}
                enrolled={enrolled}
                enroll={enroll}
                unenroll={unenroll}
                wide
              />
            ) : null}
            {r.website_url ? (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 border-transparent bg-white px-4 font-bold text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] hover:bg-white hover:shadow-[3px_3px_0_var(--navy),0_0_0_1.5px_var(--navy)] dark:bg-white/10 dark:text-foreground"
              >
                <a
                  href={r.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {msg("M-298e")}
                  <ArrowUpRight aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className={`mt-[18px] grid gap-3.5 ${page ? COLUMNS[factCount] : ""}`}
      >
        <div className={FACT}>
          <h3 className={FACT_TITLE}>{msg("M-298f")}</h3>
          <p className={BIG}>{timingLabel(timingOf(r))}</p>
          {dates ? (
            <p className="mt-3 rounded-[14px] bg-[#effaf2] px-3.5 py-3 font-extrabold text-[var(--navy)] shadow-[inset_0_0_0_2px_var(--spring)]">
              {dates}
            </p>
          ) : !signedIn ? (
            <div className="mt-3 rounded-[14px] bg-[#fff5f9] px-3.5 py-3 text-sm text-[var(--navy)] shadow-[inset_0_0_0_2px_var(--bubblegum)]">
              <b className="mb-1.5 block">{msg("M-298g")}</b>
              {/* A blurred sample, not real dates: only an account knows the birthday. */}
              <p
                aria-hidden="true"
                className="my-1.5 font-extrabold blur-[4px] select-none"
              >
                {msg("M-298x")}
              </p>
              <Button asChild size="sm" className="mt-1 h-9 px-3">
                <Link href={signUpHref}>{msg("M-280")}</Link>
              </Button>
            </div>
          ) : null}
        </div>
        {r.signup_lead_days ? (
          <div
            className={cn(
              FACT,
              "bg-[#fff0e6] shadow-[inset_0_0_0_1.5px_#ffb996] dark:bg-[#4a3438]",
            )}
          >
            <h3 className={FACT_TITLE}>{msg("M-298h")}</h3>
            <p className={BIG}>
              {msg("M-298i").replace("{days}", String(r.signup_lead_days))}
            </p>
            <p className="mt-1">
              {joinBy ??
                msg("M-298j").replace("{days}", String(r.signup_lead_days))}
            </p>
          </div>
        ) : signedIn ? (
          // "Any time before" only signed in; visitors see the join-early card only when the
          // brand has a waiting period (owner, 2026-11-25).
          <div className={FACT}>
            <h3 className={FACT_TITLE}>{msg("M-298k")}</h3>
            <p className={BIG}>{msg("M-298l")}</p>
            <p className="mt-1">{msg("M-298m")}</p>
          </div>
        ) : null}
        {/* Signed in only (owner, 2026-11-25: less to read for visitors). */}
        {signedIn ? (
          <div className={FACT}>
            <h3 className={FACT_TITLE}>{msg("M-298n")}</h3>
            {needs.length ? (
              needs.map(({ label, text }) => (
                <p key={label}>
                  <b>{label}</b> {text}
                </p>
              ))
            ) : (
              <p>{msg("M-298o")}</p>
            )}
          </div>
        ) : null}
      </section>

      {page && !signedIn ? (
        <section className="mt-[22px] flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[linear-gradient(90deg,var(--glow-pink),var(--glow-blue),var(--glow-mint))] px-6 py-5 shadow-[0_0_0_1.5px_var(--navy)]">
          <div>
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
              {msg("M-298p").replace("{brand}", r.name)}
            </h2>
            <p className="mt-1 text-muted-foreground">{msg("M-298q")}</p>
          </div>
          <Button asChild size="lg" className="h-11 px-4">
            <Link href={signUpHref}>Sign up free</Link>
          </Button>
        </section>
      ) : null}

      {page && brand.more.length ? (
        <section className="mt-[30px]">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">
            {msg("M-298r").replace("{category}", category.toLowerCase())}
          </h2>
          <ul className="mt-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {brand.more.map((m) => (
              <li key={m.id}>
                {/* A full page load: a soft one under /discover would open the pop-up. */}
                <a
                  href={`/discover/${m.id}`}
                  className="flex h-full flex-col gap-1.5 rounded-[18px] bg-white/85 p-3.5 shadow-[0_0_0_1.5px_var(--border)] outline-none hover:shadow-[0_0_0_3px_var(--spring)] focus-visible:shadow-[0_0_0_3px_var(--spring)] dark:bg-white/10"
                >
                  <span className="grid h-[52px] place-items-center">
                    <RetailerLogo
                      name={m.name}
                      logoFile={m.logo_file}
                      size={44}
                    />
                  </span>
                  <b className="text-[13px] text-muted-foreground">{m.name}</b>
                  <span className="leading-tight font-extrabold">
                    {m.reward_description}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">
            <Link href="/discover" className={LINK}>
              {msg("M-298t").replace("{count}", String(brand.total))}
            </Link>
          </p>
        </section>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-muted-foreground">
        <span>
          {msg("M-298u").replace(
            "{date}",
            formatDate(r.last_checked_on as LocalDate, "long"),
          )}{" "}
          ·{" "}
          <a
            href={r.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold underline underline-offset-2"
          >
            {msg("M-298v")}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
        {reported !== null ? (
          <ReportDialog
            retailerId={r.id}
            retailer={r.name}
            reported={reported}
            reportReward={reportReward}
          />
        ) : null}
      </div>
    </div>
  );
}
