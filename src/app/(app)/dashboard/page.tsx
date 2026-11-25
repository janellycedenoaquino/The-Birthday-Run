import { permanentRedirect } from "next/navigation";

// S-102 is gone (decision 0018): My Rewards (S-105) is the signed-in home, and its header holds
// FR-21. The route stays as a permanent redirect so old links, bookmarks and Template redirects
// that end here still work.
export default function DashboardPage() {
  permanentRedirect("/rewards");
}
