import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { render } from "react-email";
import ReminderExpiring, { expiringSubject } from "@/emails/reminder-expiring";
import ReminderPlanAhead, {
  PLAN_AHEAD_SUBJECT,
} from "@/emails/reminder-plan-ahead";
import type { ReminderLine } from "@/emails/components/reminder-parts";
import {
  addDays,
  formatDate,
  today as todayIn,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import {
  remindersDue,
  type DueReminder,
  type ReminderItem,
} from "@/lib/reminders/due";
import type { Database } from "@/lib/types/database.types";
import type { Email } from "@/server/email/send";
import { logError } from "@/server/errors";

// The daily reminder run (BUILD F-12 flow, FR-41, FR-42, D14, D15, NFR-9). Claim, then send:
// a unique reminder_log row per reminder makes a doubled run send once; a failed send deletes
// its claim so the next run tries again. No email address or user ID is logged or returned.

/** BUILD §0.4: sends per run, the whole app (Resend's free daily limit, A-24). */
export const REMINDER_RUN_BUDGET = 40;
/** Stop starting sends after this long, so the run ends inside the route's maxDuration of 60 s
 *  (a send can take up to 10 s); the rest are deferred to tomorrow. */
export const RUN_TIME_BUDGET_MS = 40_000;
/** Pickups older than this can't be in any cycle the run looks at (cycles are ≤ 1 year + lead). */
const PICKUP_LOOKBACK_DAYS = 400;

export type RunCounts = {
  candidates: number;
  sent: number;
  failed: number;
  deferred: number;
};

export type RunDeps = {
  /** The secret-key client: reminder_candidates and the claims are service_role only. */
  admin: SupabaseClient<Database>;
  send: (email: Email) => Promise<{ ok: boolean }>;
  now: Date;
  siteUrl: string;
  /** createUnsubscribeToken; null when the secret is missing, so nothing is sent. */
  tokenFor: (userId: string) => string | null;
  /** Milliseconds now, for the time budget (tests pass a fake clock). */
  clock?: () => number;
};

type Job = {
  userId: string;
  email: string;
  today: LocalDate;
  reminder: DueReminder;
};

export async function runReminders(deps: RunDeps): Promise<RunCounts> {
  const { admin, now } = deps;
  const { data: candidates, error } = await admin.rpc("reminder_candidates");
  if (error) throw new Error("reminders: candidates", { cause: error });
  const counts: RunCounts = {
    candidates: candidates.length,
    sent: 0,
    failed: 0,
    deferred: 0,
  };
  if (!candidates.length) return counts;

  const ids = candidates.map((c) => c.user_id);
  const since = addDays(todayIn("UTC", now), -PICKUP_LOOKBACK_DAYS);
  const [rewards, pickups, logs] = await Promise.all([
    admin.rpc("reminder_rewards", { p_user_ids: ids }),
    admin.rpc("reminder_pickups", { p_user_ids: ids, p_since: since }),
    admin
      .from("reminder_log")
      .select("user_id, kind, cycle_start, sent_on")
      .in("user_id", ids)
      .gte("sent_on", since),
  ]);
  for (const r of [rewards, pickups, logs])
    if (r.error) throw new Error("reminders: read", { cause: r.error });

  const jobs: Job[] = [];
  for (const c of candidates) {
    const mine = logs.data!.filter((l) => l.user_id === c.user_id);
    // One user's bad data (e.g. a zone the runtime doesn't know) must not stop everyone's run.
    let result: ReturnType<typeof remindersDue>;
    try {
      result = remindersDue({
        birthday: { month: c.birth_month, day: c.birth_day },
        timeZone: c.time_zone,
        now,
        rewards: rewards.data!.filter((r) => r.user_id === c.user_id),
        pickups: pickups
          .data!.filter((p) => p.user_id === c.user_id)
          .map((p) => ({
            retailerId: p.retailer_id,
            date: p.picked_up_on as LocalDate,
          })),
        lastExpiringOn:
          (mine
            .filter((l) => l.kind === "expiring")
            .map((l) => l.sent_on)
            .sort()
            .at(-1) as LocalDate | undefined) ?? null,
        planAheadCycles: mine
          .filter((l) => l.kind === "plan_ahead")
          .map((l) => l.cycle_start as LocalDate),
      });
    } catch (dueError) {
      logError(dueError, { op: "reminders.due" });
      counts.failed++;
      continue;
    }
    for (const reminder of result.due)
      jobs.push({
        userId: c.user_id,
        email: c.email,
        today: result.today,
        reminder,
      });
  }

  // Budget (D15): expiring first (they can't wait), then plan-ahead. Within each, an order that
  // changes every day (a hash of the user and the UTC date), so the same users aren't always
  // the ones deferred.
  const day = todayIn("UTC", now);
  const rank = (userId: string) =>
    createHash("sha256").update(`${day}:${userId}`).digest("hex");
  jobs.sort(
    (a, b) =>
      Number(a.reminder.kind !== "expiring") -
        Number(b.reminder.kind !== "expiring") ||
      rank(a.userId).localeCompare(rank(b.userId)),
  );
  const batch = jobs.slice(0, REMINDER_RUN_BUDGET);
  counts.deferred = jobs.length - batch.length;
  const clock = deps.clock ?? Date.now;
  const started = clock();
  for (const [i, job] of batch.entries()) {
    if (clock() - started > RUN_TIME_BUDGET_MS) {
      counts.deferred += batch.length - i;
      break;
    }
    const outcome = await sendOne(job, deps);
    if (outcome === "sent") counts.sent++;
    if (outcome === "failed") counts.failed++;
  }
  return counts;
}

async function sendOne(
  { userId, email, today, reminder }: Job,
  { admin, send, siteUrl, tokenFor }: RunDeps,
): Promise<"sent" | "failed" | "skipped"> {
  const token = tokenFor(userId);
  if (!token) {
    logError(new Error("reminders: no unsubscribe secret; not sent"), {
      op: "reminders.token",
    });
    return "failed";
  }
  // Claim: a unique row per reminder. A conflict means it went out already (a doubled run).
  const { data: claim, error: claimError } = await admin
    .from("reminder_log")
    .insert({
      user_id: userId,
      kind: reminder.kind,
      cycle_start: reminder.cycleStart,
      sent_on: today,
    })
    .select("id")
    .single();
  if (claimError?.code === "23505") return "skipped";
  if (claimError) {
    logError(new Error(`reminders: claim ${claimError.code ?? "unknown"}`), {
      op: "reminders.claim",
    });
    return "failed";
  }

  const unsubscribe = `${siteUrl}/api/reminders/unsubscribe?token=${encodeURIComponent(token)}`;
  const page = `${siteUrl}/reminders/unsubscribe?token=${encodeURIComponent(token)}`;
  let ok = false;
  try {
    const { subject, element } = compose(reminder, siteUrl, page);
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    ok = (
      await send({
        to: email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        // A send that timed out but went through isn't delivered again by the retry (24 h).
        idempotencyKey: `reminder:${userId}:${reminder.kind}:${
          reminder.kind === "plan_ahead" ? reminder.cycleStart : today
        }`,
      })
    ).ok;
  } catch (renderError) {
    logError(renderError, { op: "reminders.render" });
  }
  if (ok) return "sent";

  // Release the claim so the next run tries again (the welcome-email pattern).
  const { error: releaseError } = await admin
    .from("reminder_log")
    .delete()
    .eq("id", claim.id);
  if (releaseError)
    logError(
      new Error(`reminders: release ${releaseError.code ?? "unknown"}`),
      {
        op: "reminders.release",
      },
    );
  return "failed";
}

function compose(
  reminder: DueReminder,
  siteUrl: string,
  unsubscribeUrl: string,
) {
  if (reminder.kind === "expiring") {
    const items = reminder.items.map((i) => line(i, "left"));
    return {
      subject: expiringSubject(items.length),
      element: createElement(ReminderExpiring, {
        siteUrl,
        items,
        unsubscribeUrl,
      }),
    };
  }
  return {
    subject: PLAN_AHEAD_SUBJECT,
    element: createElement(ReminderPlanAhead, {
      siteUrl,
      birthday: formatDate(reminder.birthday, "long"),
      items: reminder.items.map((i) => line(i, "date")),
      unsubscribeUrl,
    }),
  };
}

/** M-120 / M-122 for expiring rewards; "Last day: {date}" for the plan-ahead list. */
function line(item: ReminderItem, style: "left" | "date"): ReminderLine {
  const when =
    style === "date"
      ? `${msg("M-120")}: ${formatDate(item.lastDay, "long")}`
      : item.daysLeft <= 1
        ? msg("M-120")
        : msg("M-122").replace("{days}", String(item.daysLeft));
  return { name: item.name, description: item.description, when };
}
