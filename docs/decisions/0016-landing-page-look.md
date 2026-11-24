# 0016. Landing page look sets the app's brand

Date: 2026-11-24 · Status: accepted

## Context
SPEC §1 planned a redesign at the end, page by page with the owner. The owner chose to start with the landing page (S-1) and take every other page's colours, font and feel from it. SPEC §3.6 still rejected "gradients, bouncing or pulsing animation", a rule written against the old app's look; it does not match what the owner wants (she rejects the generic AI look, not colour or motion).

The look was picked with three throwaway prototypes on the `prototype/landing` branch (`docs/prototypes/landing/`): one with every option switchable, one with a colour picker, and one with the locked result (`3-background-locked.html`). The owner's picks and references are on her design board, outside the repo.

## Decision
**Landing page (S-1):**
- **Background:** a 3D tunnel of retailer logo cards (the live retailers' own logos, in their own brand colours) flying toward the viewer behind a frosted card that holds the headline, text and buttons.
- **Hover:** hovering a logo card gives it a spring-green border and a label with the retailer's name and reward, and freezes all motion (tunnel and background) so it can be read.
- **Pause:** a visible "Pause motion" button stops the tunnel and the background. Motion starts paused when the device asks for reduced motion (`prefers-reduced-motion: reduce`). This also meets WCAG 2.2.2 Pause, Stop, Hide.
- **Background colour:** "pastel mix": soft glows of pink `#FFD6E5`, baby blue `#D6EBFF` and mint `#D3F5E1` on cream `#FFFCF7`, drifting slowly (flowing glow, loops of about 44 s, 52 s and 60 s).
- **Frosted card:** cream at 58% opacity with a 14px backdrop blur.
- **Headline:** Plus Jakarta Sans, weight 800, large, tight letter spacing (-0.035em) and line height (1.06). The last words ("one run.") sit in a filled colour block, tilted about -2°.
- **Below the hero:** nothing. The page stays one screen (the owner's rule: no long landing page).

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

## Alternatives
- **Tilted sliding wall of retailer cards:** liked, but the tunnel won.
- **Two-row logo marquee, floating drift:** shown, not picked.
- **Poster colours (cobalt, tangerine, acid lime), Golden Hour, light and airy with one gold accent:** the owner kept only the poster font and headline block; no yellow.
- **Logos in one shared tone, or tone until hover:** own brand colours picked.
- **Catch-the-prizes mini-game or three steps under the hero:** the owner prefers the page without them.
- **Rolling waves, still background:** flowing glow at slow speed picked.

## Consequences
- SPEC §3.6 now allows gradients and motion with a pause, and records the brand tokens; SPEC §1 and S-1 point here. The urgency colours, shadcn components and other pages are unchanged until each page's look is picked with the owner.
- The tunnel is decoration (`aria-hidden`); every retailer and reward stays reachable in Discover (S-103), so nothing is lost when motion is paused or hidden.
- Build work (later ticket): the tunnel and glow need a performance check on phones, the font is self-hosted with `next/font` (no third-party font request, keeps the CSP as is), and the logos stay local files from `public/retailers/`.
- Dark mode for the new look is not decided yet.
