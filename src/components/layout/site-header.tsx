import Link from "next/link";
import { appConfig } from "@/config/app";
import type { Account } from "./account-menu";
import { HeaderNav, HeaderShell } from "./header-nav";

// C-1 (SPEC §3.2; look: decision 0016 prototypes). No bar: the app name on a cream pill on the
// left and the links on the right, over the page's own background. It scrolls with the page.
// On the landing page (S-1) it floats over the logo tunnel (HeaderShell). What shows depends on
// the current path, so those parts are client components. Signed in, the name goes to My Rewards
// (decision 0018).
export function SiteHeader({ account }: { account: Account | null }) {
  return (
    <HeaderShell>
      <Link
        href={account ? "/rewards" : "/"}
        translate="no"
        className="logo-pill min-w-0 truncate outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {appConfig.name}
      </Link>
      <HeaderNav account={account} />
    </HeaderShell>
  );
}
