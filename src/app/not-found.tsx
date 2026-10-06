import Link from "next/link";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";

// S-19 Not found (SPEC §3.3, FR-23): inside the root layout (C-1, C-2), HTTP 404.
export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-20 sm:px-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 mb-8">{msg("M-38")}</p>
      <Button asChild size="lg">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
