import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
  const needs = [
    r.purchase_requirement &&
      msg("M-189a").replace("{text}", r.purchase_requirement),
    r.membership_requirement &&
      msg("M-189b").replace("{text}", r.membership_requirement),
    r.other_requirement && msg("M-189c").replace("{text}", r.other_requirement),
  ].filter(Boolean) as string[];
  const page = variant === "page";

  return (
    <div>
      {page ? (
        <nav
          aria-label="Breadcrumb"
          className="mt-1.5 mb-3.5 text-sm text-muted-foreground"
        >
          <Link href="/discover" className={LINK}>
            {msg("M-171a")}
          </Link>{" "}
          / {category} / {r.name}
        </nav>
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
            <RetailerLogo name={r.name} logoFile={r.logo_file} wide />
          </div>
          {page ? (
            <h1 className="headline mt-4 text-[30px] leading-[1.08]">
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
          <p className="mt-2 text-[#4c557d]">{r.description}</p>
          <span className="mt-2.5 inline-block rounded-[9px] bg-white/60 px-2.5 py-1 text-xs font-extrabold shadow-[inset_0_0_0_1.5px_var(--border)]">
            {category}
          </span>
        </div>
        <div className={page ? "px-7 py-7 sm:px-8" : "pt-5"}>
          <small className="text-xs font-extrabold tracking-[0.12em] text-muted-foreground uppercase">
            {msg("M-298a")}
          </small>
          <strong className="mt-1.5 block text-[26px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[30px]">
            {r.reward_description}
          </strong>
          {type ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <b className="text-foreground">{type.label}:</b>{" "}
              {type.explanation}
            </p>
          ) : null}
          <div className="mt-[18px] flex flex-wrap items-start gap-2.5">
            {signedIn ? (
              <EnrollToggle
                retailerId={r.id}
                name={r.name}
                enrolled={enrolled}
                enroll={enroll}
                unenroll={unenroll}
                wide
              />
            ) : (
              <Button asChild size="lg" className="h-11 px-4">
                <Link href={signUpHref}>{msg("M-298d")}</Link>
              </Button>
            )}
            {r.website_url ? (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 bg-transparent px-4 font-bold"
              >
                <a
                  href={r.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {msg("M-298e")}
                  <ExternalLink aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className={`mt-[18px] grid gap-3.5 ${page ? "md:grid-cols-3" : ""}`}
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
            className={`${FACT} bg-[#fff0e6] shadow-[inset_0_0_0_1.5px_#ffb996] dark:bg-[#4a3438]`}
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
        ) : (
          <div className={FACT}>
            <h3 className={FACT_TITLE}>{msg("M-298k")}</h3>
            <p className={BIG}>{msg("M-298l")}</p>
            <p className="mt-1">{msg("M-298m")}</p>
          </div>
        )}
        <div className={FACT}>
          <h3 className={FACT_TITLE}>{msg("M-298n")}</h3>
          {needs.length ? (
            needs.map((text) => <p key={text}>{text}</p>)
          ) : (
            <p>{msg("M-298o")}</p>
          )}
        </div>
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
          <p className="mt-1 text-muted-foreground">{msg("M-298s")}</p>
          <ul className="mt-3.5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {brand.more.map((m) => (
              <li key={m.id}>
                <Link
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
                </Link>
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
