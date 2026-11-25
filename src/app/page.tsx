import Link from "next/link";
import {
  LogoTunnel,
  type TunnelRetailer,
} from "@/components/landing/logo-tunnel";
import { PrizeGame } from "@/components/landing/prize-game";
import {
  MotionStage,
  MovingGlow,
  PauseMotionButton,
} from "@/components/motion/motion";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { createClient } from "@/server/supabase/server";

// S-1 Landing (SPEC §3.3, FR-2, FR-17, FR-24; look: decision 0016). One screen: the logo tunnel
// and the flowing glow behind a frosted card, "Pause motion", and the game's pull-up tab. Nothing
// below the hero. `?notice=account_deleted` is toasted by the root layout (C-3).
const TUNNEL_SIZE = 48;

export default async function Home() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: rows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    // Public catalogue (decision 0017): RLS returns only live retailers.
    supabase
      .from("retailers")
      .select("id, name, logo_file, reward_description")
      .is("retired_at", null),
  ]);
  const retailers = rows ?? [];
  const withLogos: TunnelRetailer[] = retailers.flatMap((r) =>
    r.logo_file
      ? [
          {
            id: r.id,
            name: r.name,
            logoFile: r.logo_file,
            reward: r.reward_description,
          },
        ]
      : [],
  );
  const tunnel = shuffle(withLogos).slice(0, TUNNEL_SIZE);

  return (
    <MotionStage className="flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      <MovingGlow />
      <LogoTunnel retailers={tunnel} />
      <PauseMotionButton className="absolute top-4 right-4 z-10 sm:top-5 sm:right-5" />
      <div className="pointer-events-none relative z-[5] flex flex-1 items-center justify-center px-4 pt-16 pb-8 sm:px-6">
        <div className="frosted pointer-events-auto max-w-[640px] rounded-[28px] px-6 py-8 text-center sm:px-10 sm:py-9">
          <h1 className="headline text-[40px] sm:text-[clamp(38px,6vw,64px)]">
            {msg("M-282")}{" "}
            <span className="headline-block">{msg("M-282b")}</span>
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:mt-4.5 sm:text-lg">
            {msg("M-283")}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {user ? (
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="h-12 px-6 text-base">
                  <Link href="/sign-up">Get started</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 bg-transparent px-6 text-base font-bold shadow-[0_0_0_1.5px_var(--navy)] dark:shadow-[0_0_0_1.5px_var(--foreground)]"
                >
                  <Link href="/discover">{msg("M-102")}</Link>
                </Button>
              </>
            )}
          </div>
          <p className="mt-4.5 text-[13px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            {msg("M-284").replace("{count}", String(retailers.length))}
          </p>
        </div>
      </div>
      <PrizeGame
        logos={withLogos.map(({ id, logoFile }) => ({ id, logoFile }))}
      />
    </MotionStage>
  );
}

/** A fresh order per request (Fisher–Yates). */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
