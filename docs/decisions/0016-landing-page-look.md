# 0016. Landing page look sets the app's brand

Date: 2026-11-24 · Status: accepted

## Context
SPEC §1 planned a redesign at the end, page by page with the owner. The owner chose to start with the landing page (S-1) and take every other page's colours, font and feel from it. SPEC §3.6 still rejected "gradients, bouncing or pulsing animation", a rule written against the old app's look; it does not match what the owner wants (she rejects the generic AI look, not colour or motion).

The look was picked with three throwaway prototypes on the `prototype/landing` branch (`docs/prototypes/landing/`): one with every option switchable, one with a colour picker, and one with the locked result (`3-background-locked.html`), and later the game prototypes (`6-game-pull-up-tab.html` is the final page; `6-laptop-and-phone.html` shows both sizes). The owner's picks and references are on her design board, outside the repo.

## Decision
**Landing page (S-1):**
- **Background:** a 3D tunnel of retailer logo cards (the live retailers' own logos, in their own brand colours) flying toward the viewer behind a frosted card that holds the headline, text and buttons.
- **Hover:** hovering a logo card gives it a spring-green border and a label with the retailer's name and reward, and freezes all motion (tunnel and background) so it can be read.
- **Pause:** a visible "Pause motion" button stops the tunnel and the background. Motion starts paused when the device asks for reduced motion (`prefers-reduced-motion: reduce`). This also meets WCAG 2.2.2 Pause, Stop, Hide.
- **Background colour:** "pastel mix": soft glows of pink `#FFD6E5`, baby blue `#D6EBFF` and mint `#D3F5E1` on cream `#FFFCF7`, drifting slowly (flowing glow, loops of about 44 s, 52 s and 60 s).
- **Frosted card:** cream at 58% opacity with a 14px backdrop blur.
- **Headline:** Plus Jakarta Sans, weight 800, large, tight letter spacing (-0.035em) and line height (1.06). The last words ("one run.") sit in a filled colour block, tilted about -2°.
- **Site name:** "The Birthday Run" in the headline font (weight 800) top left, on a soft cream panel, as on sign in and sign up; "Pause motion" stays top right.
- **Below the hero:** nothing. The page stays one screen (the owner's rule: no long landing page).
- **Game:** a 30-second "catch the prizes" game (falling retailer logos, a runner steered by mouse, touch or arrow keys, confetti on a catch, best score kept on the device) lives in a pink "Catch the prizes" tab fixed to the bottom of the screen on every size: 640px wide and centred on a laptop, full width on a phone. Tapping the tab slides the game up over the page; the headline and buttons stay visible. Pressing Play pauses the tunnel and the background (too much movement at once); they resume when the round ends unless the visitor had already paused them.
- **Runner:** the owner's own character, drawn on the canvas from her reference: a girl with a big dark-brown afro (`#2A0C0D`), medium-brown skin (`#D3874A`), a tilted purple party hat (`#9B6E9E`) with a lilac pompom, a pink tee (`#C04350`), blue shorts (`#437893`), white socks and white shoes. She runs (alternating knee lift, swinging arms, a small bob) and her eyes look the way she moves.

- **Favicon and app icons:** the doll's headshot (from the owner's 1024 px picture, white background removed, `public/brand/doll-head.png`) on the pink circle `#FFD6E5` for `/icon/32`, `/icon/192` and `/icon/512`; on a full pink square for `/apple-icon` (iOS rounds the corners and shows transparent ones as black). Replaces the brand-colour first letter.

**Sign in and sign up (Template S-4, S-5):**
- **Background:** the tilted wall of retailer cards (7 rows rotated -8°, sliding in alternating directions, 44–58 s per loop), with the logos in their own colours, each card showing its reward, the same hover (green border, name and reward, everything freezes) and the same "Pause motion" control over the pastel glow.
- **Card:** one frosted card, centred, with "Create account" / "Sign in" tabs at the top.
- **What you get** (the owner's rule: signing up or in reminds people what's waiting): under the tabs, one reward at a time (logo, "Waiting for you", the reward, the brand), changing every 2.6 s and stopping when motion is paused.
- **After Continue:** the plain "Check your email" panel with one confetti burst in the brand colours (pink, sky blue, spring green), skipped when motion is paused or reduced.

**Brand tokens for the whole app:**

| Token | Colour | Use |
| --- | --- | --- |
| background | cream `#FFFCF7` + the pastel glows | page background |
| text | navy `#1F2A5C` | all text, including on buttons and the headline block |
| muted text | `#4C557D` | secondary text |
| highlight | bubblegum `#FF9EC4` | headline block |
| primary button | sky blue `#8EC5FF`, navy text, 1.5px navy outline | the one main action |
| hover accent | spring green `#8FE3B0` | hover borders |

Contrast (WCAG 2.x formula): navy on cream 13.3:1, on the pink glow 10.4:1, on sky blue 7.5:1, on bubblegum 7.1:1. Muted `#4C557D` is at least 5.5:1 on every glow colour. The prototype's lighter muted text (`#6D7595`, 3.5:1 on pink) fails 4.5:1, so the build uses `#4C557D`. White text is never used on these colours (white on light pink is under 3:1).

Why these colours: research on colour and emotion finds that brightness and saturation change the mood more than the hue does (Valdez & Mehrabian 1994; Wilms & Oberfeld 2018), so pastels set a soft base and two stronger colours (bubblegum, sky blue) carry the accents. A button converts by standing out from the page, not by a particular hue, so the button colour is used for nothing else.

**Discover (S-103):**
- **Cards:** logo-only cards in a grid. Hovering or focusing a card shows the brand and the reward (and "Needs a purchase" when true). Phones have no hover, so touch screens always show them under the logo. No timing line and no category tags on the cards: the brand and the gift are what catch the eye.
- **Page:** big centred headline with the tilted block, the brand count, no category filter when signed out (the signed-in filters stay as SPEC S-103 says), glow background only. Missing logos show initials (FR-2).
- **Getting there:** the landing card has "Get started" (sign up) and "Browse rewards" (Discover); "Sign in" sits top right on every public page. "Get started" and "Sign in" open the same card on its two tabs.

**Discover signed in, and brand details (S-103, S-104):**
- **Cards:** the same logo cards plus a "+" button on every card (the add toggle, C-102) and a pink "Added" ribbon on the brands the user is in. Search and colour category chips appear only when signed in.
- **Details open as a pop-up card** over Discover (a bottom sheet on phones), in stacked sections: logo, name, description and category; "Your birthday gift" (full reward and its type explained); "Add to My Rewards" and "Visit website" (new tab); When (the general rule plus "Your dates"); a "Join early" warning when the brand has a lead time (FR-49); What you need (purchase, membership, other); the checked date, the source and "Something wrong? Report it" (C-107).
- **Build note:** each brand keeps its own URL (`/discover/[retailerId]`). Clicking a card on Discover opens it as the pop-up (an intercepted route, so the URL changes and Back closes it); opening the URL directly, or refreshing, shows the full page, which is what search engines and shared links get. Focus moves into the pop-up, Escape and the close button return focus to the card.

**Phone menu (C-101 on phones):**
- A bottom tab bar on every signed-in page on phones: Discover, My Rewards, Plan, History (four tabs since decision 0018 removed the dashboard), each with an icon and a label; the current tab sits on the pink block with a navy outline. The account menu stays on the round initial at the top right. Laptops keep the links in the top bar. The tab bar is hidden on onboarding, like the rest of C-101.

**Onboarding (S-101):**
- One frosted card on a still glow: no logos behind it and no drifting, so there is no "Pause motion" control (WCAG 2.2.2 covers only motion that starts by itself; the flip runs only when the user presses a button). Floating logos were dropped because onboarding is a form, and motion at the edge of vision pulls attention away from the task (NN/g, "The Role of Animation and Motion in UX"). "Step 1 of 2" text, month and day menus, then "Which programs are you in?" as a logo grid with checkboxes, search and category chips. The Save button's count ("Save 4 programs") is the only feedback when picking.
- **The card turns around:** Continue flips the card on its vertical axis (about 0.8 s, from the rotating gradient cards, pick 3), and its back is step 2. "← Change birthday" flips it back; Save or Skip flips it to the finish screen with confetti. Focus moves to the new heading. When motion is paused or reduced, the step changes with no flip.

**My Rewards parts (S-105, C-104, C-107, C-109):**
- **Mark picked up:** the C-109 pop-up as specced: the date (today by default), an optional note and an optional "where". After saving, the row turns mint green ("{retailer} picked up.") and shows "Undo" with a seconds countdown for FR-18's 60 seconds, then leaves the list.
- **Filters:** search, plus "Ends within" as chips (Any time, 1 day, 7 days, 14 days) instead of a select, and "Showing N of M".
- **Report a problem (C-107):** in a "⋯" menu on each reward row ("Report a problem", "See brand details"); after a report the item reads "Reported, thanks". The dialog lists the four reasons as large radio rows with no text box.
- **Route for free users (C-104):** the upgrade card sits over a blurred preview of a route map, so people see what Premium adds. The preview is a static picture with no real stores or location. Premium users get C-106: the map, numbered stops and Google Maps links.
- **Special states:** outside the window, a card with a calendar tile showing the start date, "Your next run starts {date}", and the S-105 links. With everything picked up, M-212 with confetti and links to History and Discover.

**Retailer page (S-104), timing split:**
- **Public:** the general rule (for example "30 days from your birthday"). That fact is what people search for, so it stays readable (decision 0017).
- **Behind sign-up:** "Sign up to see your exact dates." Signed in, the page shows the user's own dates and days left (for example "Jan 3 – Feb 2 · 12 days left"). Only an account knows the birthday, so this is the honest reason to sign up.

## Alternatives
- **Tilted sliding wall of retailer cards:** liked, but the tunnel won.
- **Two-row logo marquee, floating drift:** shown, not picked.
- **Poster colours (cobalt, tangerine, acid lime), Golden Hour, light and airy with one gold accent:** the owner kept only the poster font and headline block; no yellow.
- **Logos in one shared tone, or tone until hover:** own brand colours picked.
- **Game or three steps under the hero:** the owner prefers nothing under the hero.
- **Game inside the card** (between the text and the buttons): fits a laptop, but on a phone it pushes "Get started" off the first screen. Phone layouts tried: tap-to-play link, buttons first, compact (no subtext); the pull-up tab won and is used on the laptop too.
- **Rolling waves, still background:** flowing glow at slow speed picked.
- **Discover:** tilting cards (pick 4), flip cards, colour-band cards, shelves by category, a list, category chips or tabs, a compact header with search, a sliding logo band. Also four ways to reach Discover from the landing page: a third button, a text link, a "Discover" link by the name, and the pick.
- **Phone menu:** a ☰ button with a full-screen menu, a floating navy dock, and scrollable tabs under the name.
- **Onboarding:** logos floating or the tilted wall behind the card, step tabs or a pink progress bar, tapping a month then a day, a list with rewards, and picked logos flying into a tray or spinning in a 3D ring.
- **Brand details as a side drawer or a full page only; a gift-ticket or two-column details layout; a green check or green outline for "added"; the add button only inside the details.**
- **My Rewards:** one tap to mark picked up (with an undo bar or a "Claimed!" stamp); filters as a select or behind a Filter button; a "Report a problem" link under every card; a plain upgrade card for the route.
- **Timing on the cards,** and **hiding the timing behind sign-up:** dropped. Cards stay clean, and hiding the fact would cost search traffic.
- **Sign in / sign up:** 3D tunnel, two-row marquee and glow-only backgrounds; the card with the reminder at its side or under it; a brand count by category or a sample checklist as the reminder; a link at the bottom to switch (the Template's way); and pick 8's "your birthday run" preview checklist after Continue. The owner kept the confetti from that preview but not the checklist.

## Consequences
- Sign in and sign up keep their own routes (`/sign-in`, `/sign-up`); the tabs are links between them that keep `next`, so every existing link and redirect still works. Fields, text, Turnstile and states stay as Template S-4/S-5. The rotating reward is decoration (`aria-hidden`), so screen readers aren't interrupted every 2.6 s.
- SPEC §3.6 now allows gradients and motion with a pause, and records the brand tokens; SPEC §1 and S-1 point here. The urgency colours, shadcn components and other pages are unchanged until each page's look is picked with the owner.
- The game is optional decoration: nothing in it is needed to use the app. In the build its tab is a real button with `aria-expanded`, the sheet closes on Escape, and the game must be playable by keyboard (arrow keys). The best score stays in the browser (`localStorage` holds only a number, no personal data).
- The tunnel is decoration (`aria-hidden`); every retailer and reward stays reachable in Discover (S-103), so nothing is lost when motion is paused or hidden.
- Build work (later ticket): the tunnel and glow need a performance check on phones, the font is self-hosted with `next/font` (no third-party font request, keeps the CSP as is), and the logos stay local files from `public/retailers/`.
- Dark mode for the new look is not decided yet.
