# Quality checklist

Shared by the `pre-commit-review` and `pre-push-review` skills, next to `.claude/security-checklist.md`. The security checklist asks "is this safe?". This one asks two more questions, and the answers stay in their own report sections so neither hides the other: code can follow every rule and still build the wrong thing, or build the right thing messily.

- **Spec:** does the change do what the plan asked for, and only that?
- **Code quality:** does it follow this project's conventions, avoid common code smells, and have tests worth keeping?

Adapted from Matt Pocock's `code-review`, `tdd` and `codebase-design` skills (github.com/mattpocock/skills, MIT) oh-my-claudecode's `minimal-code-discipline` (github.com/yeachan-heo/oh-my-claudecode, MIT), and Addy Osmani's agent-skills (github.com/addyosmani/agent-skills, MIT). The smell names come from Martin Fowler's *Refactoring*, ch. 3.

## 1. Spec

**Find the requirements the change covers.** Commit messages name the FR/NFR IDs (`CLAUDE.md`, "How to work"). Look them up in:
- **Requirements:** `docs/SPEC.md` §2 (in the Template itself: `docs/template/SPEC.md` §2)
- **Screens, states and exact wording:** `docs/SPEC.md` §3 (Template: `docs/template/SPEC.md` §3)
- **The feature's build section:** `docs/BUILD.md` F-n (Template: `docs/template/BUILD.md` F-n)
- **What "done" means for this phase:** `ROADMAP.md`

If no IDs are given, match the change to a feature by its files and behavior. If nothing matches, write "no spec found for this change" and skip this section. Never invent requirements.

Report three kinds of finding, and **quote the spec line** (with its ID) for each:
- **Missing or partial:** something the requirement or its acceptance criteria ask for isn't there, e.g. an error state from the UX spec, an exact message, a "must" rule.
- **Not asked for (scope creep):** behavior, options, fields, screens or dependencies that no requirement covers. Extra features cost build time, add bugs and widen what has to be secured. The user decides whether each one stays: keep it and add it to the spec, or remove it.
- **Looks done but wrong:** it's implemented, but it doesn't match the acceptance criteria, e.g. a wrong rule, wrong wording, or a different state flow.

A different design is fine when the matching doc was updated in the same change with a reason (`CLAUDE.md`: "update the doc in the same change"). Flag it only when the code and the docs disagree.

## 2. Code quality

**Standards first:** the conventions in `docs/BUILD.md` §0 and `CLAUDE.md`. A documented convention **overrides** the smell list below: where the project endorses something a smell would flag, don't flag it. Skip anything lint, typecheck or formatting already enforce.

**Smell baseline.** Each smell is a judgement call. Label it "possible <smell>", never a hard violation. Only flag it in the changed code.
- **Mysterious name:** a function, variable or type whose name doesn't say what it does or holds. → Rename it. If no honest name comes, the design is murky.
- **Duplicated code:** the same logic appears in more than one place in the change. → Pull it into one shared function.
- **Feature envy:** a function that works mostly with another module's data. → Move it next to that data.
- **Data clumps:** the same few values keep travelling together. → Bundle them into one type.
- **Primitive obsession:** a plain string or number standing in for a real concept, e.g. money as a float or a status as any string. → Give it its own small type.
- **Repeated switches:** the same `if`/`switch` on the same kind of value appears in several places. → Use one shared map or function.
- **Shotgun surgery:** one change needs scattered edits across many files. → Gather what changes together into one module.
- **Divergent change:** one file edited for several unrelated reasons. → Split it so each file changes for one reason.
- **Speculative generality:** options, parameters, hooks or abstractions for needs the spec doesn't have. → Delete them until a real need shows up. This often goes with "not asked for" in §1.
- **Message chains:** long `a.b().c().d()` walks the caller shouldn't depend on. → Hide the walk behind one function.
- **Middle man:** a function or module that mostly passes calls through. → Call the real target directly.
- **Refused bequest:** something that inherits or implements an interface but ignores most of it. → Use composition instead.

**Module shape** (see "Where logic lives" in `docs/BUILD.md` §0.8 when the app has one). These are judgement calls too:
- **Shallow module:** its interface is nearly as complicated as its code, or it fails the deletion test (deleting it would make complexity vanish, not spread to callers). → Fold it into its caller, or move more of the logic behind it.
- **Logic in the wrong place:** a feature's rules (sums, limits, state changes) written inside a server action, route or component instead of the feature's module. → Move them into the module, and keep the action thin.
- **Swappable layer with one version:** an interface, adapter or factory with only one thing plugged in and no test version. → Remove the layer and call the thing directly.
- **Hard to test:** it creates its own dependencies (`new Client()`, reading env vars inside logic), or quietly changes its inputs instead of returning a result. → Pass dependencies in, and return results.

**Minimal code** (judgement calls, from oh-my-claudecode's `minimal-code-discipline`, MIT):
- **Reinvented helper:** new code doing what an existing helper, type or pattern in the repo already does, or a helper copied from a few files away. → Reuse it, or move it to one shared place.
- **Needless dependency:** a new package where the standard library, the platform (Next.js, Supabase, the browser) or an installed package already covers it, or a few lines would do. New packages also need the user's OK. → Use what's there.
- **Unmarked shortcut:** a deliberate simplification (a hardcoded limit, a skipped edge case) with no comment saying what it doesn't handle and what would justify replacing it. → Add a one-line comment.
- **Symptom patch:** a bug fixed separately at each place it showed up, instead of once at the shared cause. → Fix the cause.
- **Never minimized away:** input validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, and anything the user explicitly asked for. Flag any change that removes one of these to "keep it simple" as a **should fix**, or a **blocker** if the security checklist says so.

**Floor** (always flag, no setup needed; from agent-skills `constraint-driven-development`, MIT):
- New suppression comments: `@ts-ignore`, `@ts-expect-error` without a reason, `eslint-disable`, `// @ts-nocheck`.
- Unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}` blocks, handlers that silently return.
- Tests deleted or skipped with no reason in the commit message.
- These checklists, lint rules, CI checks or hooks weakened so a change can pass.
Each is a **should fix**; the last one is a **blocker** if it touches the security checklist.

**UI: avoid the AI look** (judgement calls, for screens and components; from agent-skills `frontend-ui-engineering`, MIT). Flag defaults an AI reaches for instead of the app's own design: purple/indigo everything, heavy gradients, maximum rounding on everything, generic hero sections, placeholder copy instead of the real M-ID text, oversized padding everywhere, stock card grids that ignore what matters most, layered shadows, and values off the spacing scale. Also flag contrast under 4.5:1 (3:1 for large text), skipped heading levels, and information shown by color alone (those three are accessibility: **should fix**). The user's taste: modern, sleek, soft neutrals; never dark and heavy. **Also check changed UI files against `~/.claude/skills/frontend-design/web-interface-guidelines.md`** (Vercel's 103 rules: forms, focus, keyboard, touch targets, motion, dark mode, hydration…), reporting each finding as `file:line` + the rule.

**Server speed** (judgement calls, from Vercel's `react-best-practices`, MIT): independent awaits run one after another instead of with `Promise.all()`; a server component that waits for data its siblings don't need (a waterfall), when composition would let them load in parallel; the same data fetched twice in one request instead of once through `cache()`.

**Tests worth keeping** (for tests in the change, and for code that should have come with one):
- **Tests behavior through the public interface,** not internals. A test that breaks on a refactor when behavior hasn't changed is coupled to the implementation.
- **No mocks of the app's own modules.** Mock only real boundaries: external APIs, email, payments, time, randomness.
- **Not tautological:** the expected value must come from an independent source (a known literal, a worked example, the spec), not be recomputed the way the code does it.
- **Checks through the interface,** not a side channel: e.g. read the data back with the app's function instead of querying the database directly. RLS tests are the exception, since checking the database *is* their job.
- **Covers the spec's edge cases:** the acceptance criteria's error states, limits and boundaries (exactly at a limit, over it, empty, zero). A missing edge-case test is a **should fix**.

## Sorting
- **Spec findings:** usually **should fix**. They're a **blocker** only when they are also a security problem from the security checklist (e.g. a missing ownership check the spec requires).
- **Missing tests** for new behavior: **should fix**.
- **Smells:** always **notes**. Never a blocker, never the reason for a "don't commit/push yet" verdict.
