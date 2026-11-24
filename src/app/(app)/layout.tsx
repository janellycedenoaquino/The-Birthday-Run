import { StartLocationProvider } from "@/components/location/start-location";
import { requireUser } from "@/server/auth/guards";

// The signed-in area (BUILD F-3, §0.2). It checks too, but each page calls its own guard:
// layouts don't re-run on client-side navigation. The start location (D10) lives here, in
// memory, so My Rewards and Plan share it until a reload.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <StartLocationProvider>{children}</StartLocationProvider>;
}
