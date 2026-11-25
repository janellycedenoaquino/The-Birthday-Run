import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoTunnel } from "@/components/landing/logo-tunnel";
import { PrizeGame } from "@/components/landing/prize-game";
import {
  MotionStage,
  MovingGlow,
  PauseMotionButton,
} from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { getShowcase, shuffle } from "@/server/catalog/showcase";
import { createClient } from "@/server/supabase/server";

// S-1 Landing (SPEC §3.3, FR-2, FR-17, FR-24; look: decision 0016). One screen: the logo tunnel
// and the flowing glow behind a frosted card, and the game's pull-up tab. Nothing below the hero.
// C-1 floats over the tunnel here (HeaderShell), with only "Sign in" signed out, as in the
// prototype. `?notice=account_deleted` is toasted by the root layout (C-3).
const TUNNEL_SIZE = 48;

export default async function Home() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { total, withLogos },
  ] = await Promise.all([supabase.auth.getUser(), getShowcase(supabase)]);
  // Signed in, home is My Rewards (decision 0018): this page is for visitors only.
  if (user) redirect("/rewards");
  const tunnel = shuffle(withLogos).slice(0, TUNNEL_SIZE);

  return (
    <MotionStage className="flex min-h-dvh flex-col overflow-hidden">
      <MovingGlow />
      <LogoTunnel retailers={tunnel} />
      {/* C-1 floats over the tunnel here and leaves this corner free (HeaderShell). */}
      <PauseMotionButton className="absolute top-3 right-4 z-[45] sm:right-6" />
      <div className="pointer-events-none relative z-[5] flex flex-1 items-center justify-center px-4 pt-16 pb-8 sm:px-6">
        <div className="frosted pointer-events-auto max-w-[640px] rounded-[28px] px-6 py-8 text-center sm:px-10 sm:py-9">
          {/* Phones break the lines where the messages say (owner, 2026-11-25). */}
          <h1 className="headline text-[40px] max-sm:whitespace-pre-line sm:text-[clamp(38px,6vw,64px)]">
            {msg("M-282")}
            {"\n"}
            <span className="headline-block">{msg("M-282b")}</span>
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:mt-4.5 sm:text-lg">
            {msg("M-283")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/sign-up">{msg("M-282c")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 bg-transparent px-6 text-base font-bold shadow-[0_0_0_1.5px_var(--navy)] dark:shadow-[0_0_0_1.5px_var(--foreground)]"
            >
              <Link href="/discover">{msg("M-102")}</Link>
            </Button>
          </div>
          <p className="mt-4.5 text-[13px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            {msg("M-284").replace("{count}", String(total))}
          </p>
        </div>
      </div>
      <PrizeGame
        logos={withLogos.map(({ id, logoFile }) => ({ id, logoFile }))}
      />
    </MotionStage>
  );
}
