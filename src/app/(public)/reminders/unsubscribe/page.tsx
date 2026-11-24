import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";

// S-112 Turn off reminders (SPEC §3.3, BUILD F-12, FR-42, D15). Public, and it never writes:
// the button POSTs to /api/reminders/unsubscribe, so mail scanners that open links change
// nothing. Any token is passed through as-is; the POST checks it and answers the same either way.
export const metadata: Metadata = {
  title: "Turn off reminders",
  robots: { index: false },
};

const searchSchema = z.object({
  token: z.string().max(200).optional().catch(undefined),
  done: z.literal("1").optional().catch(undefined),
  error: z.literal("rate_limited").optional().catch(undefined),
});

export default async function UnsubscribePage({
  searchParams,
}: PageProps<"/reminders/unsubscribe">) {
  const { token, done, error } = searchSchema.parse(await searchParams);
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
      {done ? (
        <>
          <h1 className="text-2xl font-semibold">{msg("M-273")}</h1>
          <p className="mt-3">{msg("M-274")}</p>
          <p className="mt-4">
            <Link
              href="/settings#reminders"
              className="underline underline-offset-4"
            >
              Settings
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{msg("M-270")}</h1>
          <p className="mt-3">{msg("M-271")}</p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {msg("M-5")}
            </p>
          ) : null}
          <form
            method="post"
            action={`/api/reminders/unsubscribe?token=${encodeURIComponent(token ?? "")}`}
            className="mt-6"
          >
            <input type="hidden" name="source" value="page" />
            <Button type="submit" size="lg">
              {msg("M-272")}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
