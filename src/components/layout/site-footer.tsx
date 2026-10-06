import Link from "next/link";
import { appConfig } from "@/config/app";
import { ThemeSelect } from "./theme-select";

// C-2 (SPEC §3.2, FR-17): same order and position on every page (WCAG 3.2.6).
const linkClass =
  "inline-flex min-h-6 items-center rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {appConfig.legal.entityName}
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Terms
              </Link>
            </li>
            <li>
              <a
                href={`mailto:${appConfig.supportEmail}`}
                className={linkClass}
              >
                Contact support
              </a>
            </li>
            <li>
              <ThemeSelect />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
