# 0018. My Rewards is the signed-in home; no separate dashboard

Date: 2026-11-24 · Status: accepted

## Context
FR-21 planned a dashboard (S-102) with a greeting, pickups this cycle and four link cards. While picking the look (decision 0016), the owner saw that most of it repeated other places: the "ending soon" rewards are the top of My Rewards (S-105), and the link cards repeat the menu that is always on screen (C-101). She compared a slim dashboard with making My Rewards the home page, side by side, and chose My Rewards: one page instead of two, nothing shown twice, less to build and maintain.

## Decision
- **No dashboard page.** `/dashboard` stays only as a permanent redirect to `/rewards`, so Template links and redirects that end on S-12 still work.
- **My Rewards is where signed-in users land:** after sign-in, after onboarding (FR-7), and from the payment return page (S-111).
- **FR-21 moves into S-105's header:**
  - The header card keeps S-105's greeting states (M-201–M-204, with the name when set).
  - It adds the pickups line (M-126 and M-127, or M-128).
- **A new row under the header** holds two cards:
  - **Progress ring:** "{picked} of {total} picked up this run", for the user's current-cycle rewards.
  - **Big countdown:** during the window, the number of rewards open now and how many end within 3 days. Outside the window, the days to the birthday.
- **Then the reward list, in two sections:**
  - "Open now": soonest end first, with C-103 badges and "Picked up".
  - "Starting later": with each start date.
  - Picked-up rewards are never shown; they move to History.
- **No enrollments (FR-16):** the header and countdown stay. A "No programs yet" card links to Discover and offers 4 popular retailers with a "+" add button (the C-102 toggle), so the page is never empty.
- **The menu (C-101) loses "Dashboard":** Discover, My Rewards, Plan, History. On phones, the tab bar has these four tabs (decision 0016).
- **The link cards and M-129a–d go;** the menu covers them.

## Alternatives
- **Slim dashboard:** a greeting, the pickups line and the 4 rewards ending soonest, with "All my rewards". This still repeats My Rewards, and it means one more page to build, test and keep in step.
- **The dashboard as specced:** a greeting, two numbers and four link cards. Nearly all of it is shown elsewhere.

## Consequences
- **SPEC:**
  - Changed: FR-7, FR-21, S-101's targets, S-105 (look, header row, empty state), C-101, S-111 and the flow diagram.
  - S-102 now says it was removed.
  - M-101 drops "Dashboard"; M-129a–d are retired.
- **BUILD:**
  - F-4 drops the `/dashboard` page for a redirect.
  - Its count test now compares S-105's header with S-107.
  - Onboarding and the guards redirect to `/rewards`.
- **No data change.** FR-21's count still uses the current cycle, so it matches History.
- **Template follow-up:** none. The redirect keeps S-12's route alive.
