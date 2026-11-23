# 0007. Five timing types, a sign-up lead time, and warnings for brand rules

Date: 2026-11-23 · Status: accepted (owner, day session)

## Context
Research for the timing module (complaints and brand help pages) found rules FR-11's three timing types couldn't hold, and problems our dates can't solve:
- "Loaded on the 1st of your birth month, valid 30 days" (it runs into the next month in February).
- "From your birthday to the end of your birth month".
- Brands often need members to join 7–30 days before the birthday (Starbucks: 7), or the reward never arrives.
- Rewards platforms issue and expire by their own clock, often Eastern, so a reward can end before the user's local day does (a platform's own changelog fixed one that expired a day early).
- Feb 29 birthdays: we use Feb 28 in other years (FR-10), but some brands use Mar 1, and many sign-up forms reject Feb 29.
- A JavaScript classic: `new Date("2026-06-15")` is read as UTC midnight, so in the US it shows June 14.

## Decision
- Two more timing types, so five in all: `month_start` (the 1st of the birth month for N days) and `to_month_end` (the birthday to the last day of the birth month). Two migrations, since Postgres can't use a new enum value in the transaction that adds it.
- `signup_lead_days` (1–90, optional) on `retailers` and in the CSV.
- FR-49: the join-by line (M-277), a last-day note (M-276), and a Feb 29 note (M-278). We don't track each brand's time zone.
- `formatDate` in the timing module, and a lint rule that blocks `new Date()` with a string or a single argument anywhere else.

## Alternatives
- A free-form "custom" timing with start and end offsets: the same power, but harder to fill in correctly during F-14 and to label (M-181–M-184b).
- Storing each brand's time zone: unknown for most brands, and the gain is a few hours on the last day. The note covers it.
- Using Mar 1 for Feb 29: FR-10 already chose Feb 28; brands disagree, so the note tells the user to check.

## Consequences
- FR-1, FR-11, FR-49, DESIGN §3 and BUILD F-1/F-2 updated. The F-14 data checks now record the lead time and pick from five types.
- The owner runs `npx supabase db push --remote` after merging (two migrations).
- F-4's UI and the message catalogue add M-184a, M-184b and M-276–M-278 when the screens are built.
