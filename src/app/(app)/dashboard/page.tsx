import { redirect } from "next/navigation";

// S-102 is gone (decision 0018): My Rewards (S-105) is the signed-in home, and its header holds
// FR-21. The route stays as a redirect so old links, bookmarks and Template redirects that end
// here still work. A temporary one (307), not 308: browsers don't cache it, so the route can
// come back later without old visitors being stuck on the redirect.
export default function DashboardPage() {
  redirect("/rewards");
}
