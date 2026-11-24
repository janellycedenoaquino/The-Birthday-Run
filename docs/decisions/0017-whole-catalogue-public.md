# 0017. The whole retailer catalogue is public

Date: 2026-11-24 · Status: accepted

## Context
FR-2 and D3 showed signed-out visitors only the popular retailers. Every other retailer page returned a 404 until the visitor signed in, and the sitemap listed only `/`, `/privacy` and `/terms`. The owner asked whether Discover should be retired now that the landing page shows the retailers. It shouldn't be: the landing page's logo tunnel is decoration (`aria-hidden` images with empty alt text and no text content). Search engines index only content that is visible as text and reachable through real links (Google Search Central, "JavaScript SEO basics").

People search one brand at a time ("Panera birthday reward"). A retailer that search engines can't read can never bring a visitor. The pages that rank for "birthday freebies" publish their full lists openly: Hip2Save (230+ offers), FinanceBuzz (235), Slickdeals (205). Google says gated content doesn't rank like open content (Search Central, "Flexible Sampling").

Hiding part of the list doesn't stop copying either: one free account sees everything, and the rows are already public in `data/retailers.csv`. In the US, facts can't be copyrighted (Feist v. Rural, 1991). The catalogue's edge is that every reward was checked on the brand's own page (F-14) and carries its check date.

## Decision
- `anon` RLS on `public.retailers` returns every non-retired row (migration `20261124230000_retailers_public.sql`). Retired rows stay hidden, and writes stay owner-only.
- Signed out, Discover (S-103) shows every card without toggles or filters, ending in M-111. That prompt no longer gives a count; it says what signing up adds. Every retailer's details page (S-104) is public.
- `/sitemap.xml` lists `/discover` and every non-retired retailer page. It reads with the publishable key and no cookies, so it always runs as `anon` and RLS keeps out any page a signed-out visitor can't open, even when a signed-in user requests it. Each entry's `lastModified` is the row's `updated_at`.
- Joining a program, plans, reminders and premium stay signed in.

## Alternatives
- **Retire Discover:** the landing page can't be indexed, so the app would have no pages that search can find.
- **Keep half public:** search can't find the hidden half, and copying isn't prevented.

## Consequences
- FR-2, S-103, S-104, M-111, M-171b, D3, flow 101, T-104 and the BUILD F-1/F-3 tests are updated to match. The RLS test now proves that `anon` sees every non-retired row and no retired ones. The e2e test proves that a non-popular page opens signed out, a retired or unknown ID is a 404, and the sitemap lists the pages.
- `public.retailer_counts()` is no longer called. It stays for now (its RLS tests still pass) and can be dropped in a later migration.
- `is_popular` and its index no longer gate anything in the app. They stay in the CSV and table (the flag can come back for ordering or a "popular" badge) and can be dropped later with `retailer_counts()`.
- The sitemap reads the database on each request instead of being a static file. A database error fails the whole sitemap (reported to Sentry); crawlers retry. Discover and the sitemap read at most `max_rows` (1000) rows, ten times today's catalogue: paginate before the catalogue nears it.
- For the redesign (decision 0016): the tunnel's logos can link to their retailer pages, which gives search engines real links from the home page.
- Google's spam policy targets pages made mainly to manipulate rankings (Search Central blog, March 2024). Each page here has the brand's checked terms, timing, requirements and source, so it is useful content. Pages for unverified brands stay out (`data/retailers-unverified.csv`).
