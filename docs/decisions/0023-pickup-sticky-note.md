# 0023. "Mark picked up" is a pastel blue sticky note with "How did it go?" taps

Date: 2026-11-25 · Status: accepted (owner, 2026-11-25, after seeing mockups)

## Context
C-109 was a plain dialog with "Date", "Note (optional)" and "Where (optional)". The owner wants
it to feel like a sticky note, so people enjoy filling it in and leave more useful notes.
Mockups showed three styles (a yellow pad, a pink pinned note with tap answers, three small
notes), then a colour wheel. The owner picked the pinned note with taps, in one colour.

## Decision
- The dialog keeps today's size and blurred overlay. It's a pastel blue (`#d6ebff`) note with a
  pink pin and a folded corner, tilted 1.5° on wider screens and straight on phones. Navy text
  on the blue in both themes (about 11:1); dark mode keeps the blue paper.
- Title M-112 "Got your {retailer} treat!"; fields M-311 "When?", M-312 "How did it go?" (taps
  M-312a–e), M-313 "Anything else?", M-314 "Where?". The button stays M-115 "Mark picked up".
- **The taps go into the note.** Tapping puts them on the note's first line ("Easy · Needed the
  app"), above anything typed; untapping removes them. They're saved in FR-17's one note field,
  count toward its 500-character limit, and show in History as part of the note.
- A handwritten font (Caveat, self-hosted by `next/font`, so the CSP is unchanged) for the title
  and what people type. Plus Jakarta Sans stays the font everywhere else (amends decision 0016).

## Not chosen
- A colour wheel with six pastels remembered on the account, and each note shown in its colour
  in History: dropped by the owner for one colour, so no profile setting and no new column.
- Taps in their own column, counted across users to take rewards down: dropped as overkill.
  Problem reports (C-107, F-13) already do that, and a reward only changes through a
  `data/retailers.csv` PR the owner approves (D2). The notes stay private to each user, so the
  privacy page doesn't change.
