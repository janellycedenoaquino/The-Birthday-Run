# 0002. Planning docs restructured into a layered layout

Date: 2026-09-28 · Status: accepted

## Context
The first planning run produced about 50,000 words in eight documents (brief, PRD, RFC, UX spec, system design, detailed design, API spec, launch checklist). Many facts appeared in several of them (about 25 repeated passages; the value "30 days" appeared in 7 files and "500 ms" in 6), so a change would have had to be made in many places, and a session had to load too much to build one phase.

## Decision
The same approved content now lives in `docs/template/`: SPEC (brief, requirements, screens and all user-facing text), DESIGN (decisions D1–D24, architecture, data model, security, operations), BUILD (conventions plus one section per feature F-1–F-13), RESEARCH, LAUNCH-CHECKLIST and this folder, with ROADMAP.md listing what to read per phase and OVERVIEW.md as the per-session map. Every fact has exactly one home and everything else refers to it by ID. All IDs were kept. The old files are in `docs/archive/` for reference only.

## Alternatives
- Keep the eight documents and add OVERVIEW.md only (the 2026-09-26 stopgap): the repetition stays, and so does the risk of documents disagreeing.

## Consequences
0001 refers to `docs/03-RFC.md`; those decisions are now DESIGN §1 (same numbers). `docs/template/` is the Template's own; apps created from the Template write their docs in `docs/`.
