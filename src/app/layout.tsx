import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import "./globals.css";
import { appConfig } from "@/config/app";
import { BrandStyle } from "@/components/layout/brand-style";
import { SiteFooter } from "@/components/layout/site-footer";
import { NoticeToast } from "@/components/layout/notice-toast";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { signOut } from "@/server/actions/auth";
import { createClient } from "@/server/supabase/server";

// Titles "{Page} · {name}" (FR-24, SPEC §3.7). Pages set their own title and, for protected and
// auth pages, `robots: { index: false }`.
export const metadata: Metadata = {
  title: { default: appConfig.name, template: `%s · ${appConfig.name}` },
  description: appConfig.description,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the proxy's nonce makes every page render per request. Next then takes the nonce from
  // the request's CSP header and puts it on its own scripts (Next CSP guide; D5, BUILD §0.7).
  // Static pages would ship scripts the CSP blocks. Router prefetches skip the proxy by design
  // (its matcher), so only a real page request without a nonce is an error (decision 0010).
  const h = await headers();
  const nonce = h.get("x-nonce");
  const prefetch =
    h.has("next-router-prefetch") || h.get("purpose") === "prefetch";
  if (!nonce && !prefetch)
    throw new Error("x-nonce missing: the proxy didn't run for this request");

  // C-1's account (D24.9): verified with the Auth server; the email is always shown. A display
  // name is read only for signed-in visitors.
  const account = await currentAccount();

  // suppressHydrationWarning: next-themes sets the theme class on <html> before React hydrates.
  return (
    <html lang="en" className="scroll-pt-16" suppressHydrationWarning>
      <head>
        {nonce && <BrandStyle nonce={nonce} brand={appConfig.brand} />}
      </head>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          nonce={nonce ?? undefined}
        >
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-3 focus:ring-ring/50"
          >
            Skip to content
          </a>
          <SiteHeader account={account} />
          <main id="content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
          <Toaster position="top-center" />
          <Suspense>
            <NoticeToast />
          </Suspense>
        </ThemeProvider>
        {/* Vercel Web Analytics (FR-32), the only analytics. Its script is injected by the
            nonce'd bundle, so 'strict-dynamic' covers it; /_vercel/insights is same-origin. */}
        <Analytics />
      </body>
    </html>
  );
}

async function currentAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return {
    email: user.email,
    displayName: profile?.display_name ?? null,
    signOut,
  };
}
