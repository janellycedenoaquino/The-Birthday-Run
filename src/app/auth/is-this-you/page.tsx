import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { maskEmail } from "@/lib/security/mask-email";
import { readPending } from "@/server/auth/pending-sign-in";

// S-113 "Is this you?" (SPEC §3.3, decision 0026, T-118). Public. /auth/confirm's GET sends
// every verified email link here; nothing is signed in until the visitor answers. Both buttons
// POST back to /auth/confirm, which reads the signed `auth_pending` cookie: the email shown
// comes from that cookie, never from the URL, and the form sends back that sign-in's ID. No held session (expired, used, never there) →
// S-8. `declined=1` only shows the "not signed in" text; it changes nothing.
export const metadata: Metadata = {
  title: "Is this you?",
  robots: { index: false },
};

const searchSchema = z.object({
  declined: z.literal("1").optional().catch(undefined),
});

export default async function IsThisYouPage({
  searchParams,
}: PageProps<"/auth/is-this-you">) {
  const { declined } = searchSchema.parse(await searchParams);

  if (declined) {
    return (
      <div className="small-page frosted">
        <h1 className="text-2xl font-semibold">{msg("M-321")}</h1>
        <p className="mt-2 mb-8">{msg("M-322")}</p>
        <Button asChild size="lg">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const held = await readPending();
  if (!held?.fresh) redirect("/auth/error?reason=link");
  const [before, after] = msg("M-317").split("{email}");

  return (
    <div className="small-page frosted">
      <h1 className="text-2xl font-semibold">{msg("M-316")}</h1>
      <p className="mt-2">
        {before}
        <strong>{maskEmail(held.payload.email)}</strong>
        {after}
      </p>
      <p className="mt-2 mb-8 text-sm opacity-80">{msg("M-318")}</p>
      <form
        method="post"
        action="/auth/confirm"
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"
      >
        {/* Ties the answer to this sign-in, not to one a later link holds (decision 0026). */}
        <input type="hidden" name="held" value={held.id} />
        <Button type="submit" name="choice" value="yes" size="lg">
          {msg("M-319")}
        </Button>
        <Button
          type="submit"
          name="choice"
          value="no"
          size="lg"
          variant="outline"
        >
          {msg("M-320")}
        </Button>
      </form>
    </div>
  );
}
