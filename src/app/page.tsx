import Link from "next/link";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app";
import { createClient } from "@/server/supabase/server";

// S-1 Landing (SPEC §3.3, FR-17, FR-24): the app's name and description, nothing more (each app
// replaces the body; no placeholder feature grid, SPEC §3.6). `?notice=account_deleted` is toasted
// by the root layout (C-3).
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {appConfig.name}
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        {appConfig.description}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {user ? (
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/sign-up">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
