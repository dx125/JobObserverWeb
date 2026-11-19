# Development log

Chronological, **append-only** record of what was done and why, so every move and intention is
traceable. Newest entry last. Decisions have their own record ([DECISIONS.md](DECISIONS.md)); plans
live in [ROADMAP.md](ROADMAP.md). Entry template:

```
## YYYY-MM-DD - short title
**Intent:** what we were trying to achieve and why.
**Done:** what actually changed (files/areas).
**Findings / surprises:** anything learned that wasn't expected.
**Verification:** how we know it works (commands, results) - and what was NOT verified.
**Follow-ups:** pointers to ROADMAP items / ADRs.
```

---

## 2026-11-19 - Project inception: inventory of the desktop app

**Intent:** Build a web version of JobObserver that does not miss any desktop functionality, stays
independent of any single backend while using the existing Supabase one, and ships with a mock backend
for sandbox testing. Before writing code, establish exactly what "all desktop functionality" means.

**Done:** Read the desktop client end to end (`apps/desktop/lib`: config, DAL, models, services,
router, 6 pages, 2 widgets, ~2,000 lines) and the backend it uses (`apps/api-functions`: RLS policy
migration, `search_jobs` signature, `ai-job-search` Edge Function). Produced the capability list that
became [FEATURE_PARITY.md](FEATURE_PARITY.md) (29 rows).

**Findings / surprises:**
- The desktop's architecture is already ports-and-adapters-shaped (`abstract interface class XxxDal`
  + services + Riverpod DI), which made a faithful, backend-independent port straightforward.
- Several backend capabilities have no desktop UI (`posted_after`, `salary_max_filter`,
  `remote_scopes`, saved-search rename, running a saved search). Parity = what the desktop exposes;
  carried through the model anyway so UI can be added cheaply.
- **The `ai-job-search` Edge Function has no CORS handling** (returns 405 for `OPTIONS`). Native
  clients don't care; browsers cannot call it. Recorded as [ADR-013](DECISIONS.md#adr-013) and as
  ROADMAP R1. Deliberately *not* patched from here (other repo's backend, needs a deploy).
- The existing Supabase project is reachable only with credentials this session does not have, so the
  live backend could not be exercised (see Verification below).

**Verification:** n/a (analysis only).

**Follow-ups:** ADR-001..003, ADR-013.

## 2026-11-19 - Repo scaffold and toolchain

**Intent:** Start from a minimal, boring, fully-typed toolchain consistent with the owner's other repo
(pnpm, TypeScript, vitest).

**Done:** `JobObserverWeb` (initial commit contained only `LICENSE`) got: `package.json` (pnpm 9.15.9,
Node >= 20), Vite 5 + React 18 + react-router 6 + `@supabase/supabase-js` 2 + DOMPurify; dev tools:
TypeScript 5.6 (strict + `noUncheckedIndexedAccess`), Vitest 2 + jsdom + Testing Library; `.gitignore`
(secrets ignored, `.env.example` and `.env.mock` committed), `.env.example`, `.env.mock`.

**Findings / surprises:** `.gitignore` rule `.env.*` also matched `.env.mock`; added an explicit
`!.env.mock` exception (it holds no secrets).

**Verification:** `pnpm typecheck` clean.

**Follow-ups:** ADR-002.

## 2026-11-19 - Core domain, ports and services

**Intent:** Put all business rules behind backend-neutral interfaces first, so both adapters and the UI
can be built against a stable seam.

**Done:** `src/core`: `models.ts` (camelCase, ISO-string dates), `ports.ts` (`AuthPort`, `JobsPort`,
`SavedSearchPort`, `Backend`, `KeyValueStore`), services ported from the desktop (`SearchService` with
cache + AI fallback rules - empty query and `< 3` hits fall back, AI never cached; `AuthService`
password/required checks; `SavedSearchService` name validation; `JobService`), `SearchCache` (30 min
TTL, 50-entry cap, per-backend namespace, corrupt-entry tolerant), `search-params.ts` (URL codec),
`format.ts` (salary/posted/summary/safe-URL helpers ported from `JobCard` etc.).

**Findings / surprises:** Validation methods were first written as plain methods that `throw`
synchronously; changed to `async` so callers always get a rejected promise (and tests can use
`rejects`).

**Verification:** covered by `core.test.ts` (17 tests).

**Follow-ups:** ADR-005, ADR-006, ADR-009.

## 2026-11-19 - Supabase adapter

**Intent:** Reproduce the desktop's exact calls so both clients behave identically on the same
project, and make that equivalence testable without a network.

**Done:** `adapters/supabase/mappers.ts` (pure wire<->domain mapping: RPC args incl. nulls for empty
filters and `salary_desc`, AI request body with single-value collapsing, `query_json` with desktop key
names, row mappers with defaults, `final_score` -> `rank`) and `supabase-backend.ts` (the three port
implementations over an injected `SupabaseClient`; Edge Function errors report HTTP status + body like
the desktop; `signUp` reports `needsConfirmation`).

**Findings / surprises:** supabase-js returns `{data, error}` instead of throwing and exposes failed
function calls as `FunctionsHttpError` with the `Response` in `context` - handled in
`describeFunctionError`.

**Verification:** `supabase.test.ts` (12 tests) with a fake client pins RPC names/args, function body,
`query_json` keys, mapping defaults, auth subscribe/unsubscribe. **Not verified against a live project.**

**Follow-ups:** ROADMAP R2, R11, R12; [BACKEND_CONTRACT.md](BACKEND_CONTRACT.md).

## 2026-11-19 - Mock backend

**Intent:** A sandbox that exercises every UI state with zero network, usable by developers, demos and
the automated tests.

**Done:** `adapters/mock`: seeded deterministic dataset (60 jobs + 1 hostile XSS fixture), `search`
(filters/AND keywords/3 sorts/paging mirroring `search_jobs`), `aiSearch` (401 when signed out,
synonyms, blended score, mock planner where UI filters win), auth with demo account and persistence,
saved searches with persistence, optional artificial latency. `Backend.sandbox` (optional) lets the UI
show demo credentials without importing the mock.

**Findings / surprises:** The first draft had `LoginPage` import `DEMO_USER` from the mock adapter,
violating the "UI never imports an adapter" rule; fixed by adding the optional `sandbox` field to the
`Backend` port.

**Verification:** `mock-backend.test.ts` (12 tests).

**Follow-ups:** ADR-004; [MOCK_BACKEND.md](MOCK_BACKEND.md).

## 2026-11-19 - UI

**Intent:** Match the desktop screens and behaviors one for one, adapted to the web (URL state,
responsive layout, dark mode, accessibility).

**Done:** App shell with rail/top-bar nav and sandbox badge; Login (sign-in/up, demo helper, e-mail
confirmation message), Search (query form, AI + planner toggles, filters panel, results, AI-fallback
banner, "Save search" dialog), Job detail (sanitized HTML or plain text, "View original", sources
panel, back navigation), Saved searches (list, summary, delete, **Run**), Settings (user, sign out,
clear cache), Setup-required page. Route guards equal to the desktop's. Min-salary slider commits on
release.

**Findings / surprises:** Using the URL as state (ADR-005) removed the need for any global store.

**Verification:** `pnpm typecheck` clean; `pnpm build` OK (466 kB JS / 139 kB gzip).

**Follow-ups:** ADR-005, ADR-007, ADR-010, ADR-011.

## 2026-11-19 - Tests and security check

**Intent:** Make "no desktop functionality missed" something the test suite protects, not a claim.

**Done:** UI integration suite `ui/app.test.tsx` (12 tests: guard, bad credentials, session
persistence, search + filter + empty state, AI toggles, AI fallback banner / no banner, save -> list ->
delete, settings clear-cache + sign-out, detail + back link, not-found, XSS fixture) and
`app/config.test.ts` (5).

**Findings / surprises:** All 58 tests passed on the first full run, which is not evidence the tests
are sharp - so the XSS test was **mutation-checked**: with DOMPurify temporarily bypassed it failed
(`expected <script></script> to be null`), then the file was restored and re-verified.

**Verification:** `pnpm test` -> 5 files, **58 tests passed**; `pnpm build` OK. Not run in a real
browser (ROADMAP R5); not run against the live backend (R2).

**Follow-ups:** ADR-012; ROADMAP R5, R11.

## 2026-11-19 - Documentation set

**Intent:** Satisfy the requirement that every move, intention and decision is documented, and make the
process self-sustaining.

**Done:** `README.md`, `CLAUDE.md` (docs-update rule as part of "done"), and in `docs/`:
`DEVELOPMENT_LOG.md` (this file), `DECISIONS.md` (14 ADRs), `ROADMAP.md` (17 items), `ARCHITECTURE.md`,
`BACKEND_CONTRACT.md` (incl. the CORS patch), `FEATURE_PARITY.md`, `MOCK_BACKEND.md`.

**Findings / surprises:** Writing the contract doc surfaced the CORS gap's precise shape (preflight
reaches the handler only because `verify_jwt` lets `OPTIONS` through) - captured in
BACKEND_CONTRACT.md.

**Verification:** links between documents checked by hand; commands in README were run.

**Follow-ups:** ADR-014; ROADMAP R1-R5 are the immediate next steps.

## 2026-11-19 - Production-style demo build where any credentials work

**Intent:** The owner asked to launch the "real prod version" and make sure that, for now, any
credentials work. Real Supabase auth cannot satisfy that (it checks actual accounts, and this project
has no credentials for the live project), so the production bundle was built on the mock adapter with a
demo switch.

**Done:** Stopped the earlier dev server. Added opt-in `acceptAnyCredentials` to the mock backend
(`VITE_MOCK_ANY_CREDENTIALS=true`), `SandboxInfo.acceptsAnyCredentials` on the port, config parsing,
factory wiring, and a "Demo mode" login banner. Tests: 3 new (any-credentials identity stability,
off-by-default advertisement, strict flag parsing). Built with
`VITE_BACKEND=mock VITE_MOCK_ANY_CREDENTIALS=true pnpm build` and served with `pnpm preview` on
port 4173. Docs: ADR-015, MOCK_BACKEND.md, `.env.example`.

**Findings / surprises:** None in code. Decision worth noting: the flags are passed on the command line
rather than stored in `.env.production`, so a future real build cannot silently inherit "any password
works".

**Verification:** `pnpm typecheck` clean; `pnpm test` -> 61 passed; `pnpm build` OK; preview server
answers 200 for `/` and for the deep link `/jobs/mock-job-001` (SPA fallback). **Not verified:** the
page was not viewed in a browser by the assistant; the login flow of the *built* bundle was not clicked
through (it is covered only via the same code under jsdom).

**Follow-ups:** ADR-015; ROADMAP R2/R3 replace this with real Supabase config and hosting.

## 2026-11-19 - Attempt to launch against the real backend: the project no longer exists

**Intent:** The owner asked to launch the web app against the real backend instead of the sandbox.
Plan: build with `VITE_BACKEND=supabase` using `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the
`JobObserver` `.env` (anon key only, passed through process env, never written to this repo).

**Done:** Stopped the demo preview. Read the two values (both present; the key is a legacy JWT-style
anon key) and probed the backend before building.

**Findings / surprises:**
- `SUPABASE_URL` in `JobObserver/.env`, `INGEST_BASE_URL`, and the CLI link
  (`apps/api-functions/supabase/.temp/project-ref`) all point at the same project ref (`pfzeu...`).
- That host **does not resolve**: `curl` fails with "Could not resolve host", and Google DNS returns
  NXDOMAIN, while general internet access works (supabase.com and github.com answer 200).
- `supabase projects list` (the CLI is logged in) shows 5 projects in the account, **none** with that
  ref. Conclusion: the JobObserver Supabase project was deleted (or lives in another account).
- Other projects exist in the account (belonging to other apps). They were deliberately **not** used:
  pointing this app at them would read/write another application's data.

**Verification:** DNS/HTTP probes and the CLI listing above. No real-backend build was produced; no
secrets were written to disk or printed.

**Follow-ups:** ROADMAP R2 is now additionally blocked on (re)creating the backend: new project +
`supabase db push --include-all` + seed + deploy the Edge Functions (docs/deploy.md in `JobObserver`),
then update `JobObserver/.env`. The desktop app and the ingest connectors are affected by the same
missing project.

## 2026-11-19 - Real-backend launch after the Supabase project was un-paused

**Intent:** Retry the real-backend launch; the owner said the project had been paused (not deleted).

**Done:** Re-probed: the project host resolves again and the `search_jobs` RPC answers 200 with real job
rows (anon key). Built `VITE_BACKEND=supabase` with the URL and anon key from `JobObserver/.env`
(passed through process env, nothing written to this repo; demo flag unset) and served it with
`pnpm preview` on port 4173.

**Findings / surprises:**
- The earlier conclusion ("project deleted", previous entry) was **wrong**: a paused project's host does
  not resolve either, and the project does not appear in `supabase projects list` (it is evidently not
  in the CLI's account, so absence from that list is not proof of deletion). Corrected here per the
  append-only rule; ROADMAP R2 is no longer blocked on recreating the backend.
- Auth settings (public endpoint): e-mail provider on, sign-ups enabled, **auto-confirm on** - so
  sign-up logs in immediately and the "check your e-mail" path is not exercised on this project.
- `OPTIONS /functions/v1/ai-job-search` still returns **405**: ADR-013 / R1 (CORS patch) is confirmed as
  still required; AI search will fail in the browser until it is applied and deployed.
- Bundle check: the anon key is inlined once; the service-role key and the string `service_role` are
  absent. (A first check reported a hit: a false positive, because all Supabase JWTs share the same
  30-char header; re-checked on a distinctive part of the key.)

**Verification:** RPC probe 200; production build OK; preview answers 200. **Not verified:** a sign-in,
search or job-detail click-through in a browser against the live backend (R2 checklist still to run);
AI search (blocked by CORS).

**Follow-ups:** ROADMAP R1 (CORS), R2 (smoke checklist), R18.

## Related, outside this repo (2026-11-19)

In `JobObserver` (the desktop repo), in the same working session: created `.claude/settings.json`
with the shared permission allowlist copied from `KnowledgeBase/.claude/settings.json` plus read-only
shell commands (`cat, ls, wc, head, tail, grep, sort, diff, du, file, stat, pwd, cd, which, where`,
read-only `git status/log/diff/show/branch/remote -v`, `--version` probes). No backend change was made
(see ADR-013).

## 2026-11-19 - Roadmap re-plan from a full review

**Intent:** The owner asked for a development roadmap built from the app's goal and from what
comparable products offer: missing features and UX, deep refactoring, architecture fixes and bugs.
Base it on the code and the backend as they are now, not on the earlier plan.

**Done:** Read all of `src/` and `docs/`, the desktop's saved-search parsing, and the `JobObserver`
backend migrations and Edge Functions added after the parity inventory. Rewrote
[ROADMAP.md](ROADMAP.md) as seven phases (ship safely, fix defects, architecture, find and judge,
track and observe, accounts, platform) with 44 new items (R19-R62), backend change requests
(BR1-BR10), open decisions (D1-D9), desktop follow-ups and milestones M1-M3. R1-R18 keep their IDs;
R3, R5, R6, R7, R8 and R13 were widened, and R13 moved up from "Later" to Phase 2. No code changed.

**Findings / surprises:**
- Nothing is committed: every project file except `LICENSE` is untracked (R19).
- Sanitizer gap, verified by running the app's DOMPurify options under jsdom: the `style` attribute
  (a full-screen `position:fixed` overlay), `<form action="https://...">` with a password `<input>`,
  and remote `<img>` all survive; scripts and `<style>` are stripped. This is not script XSS, but it
  allows UI redress and credential phishing on the app's origin (R20).
- Defects found by reading the code: AI hits render "just now" / "1 source" because `aiHitFromRow`
  fabricates `firstSeenAt` and `sourceCount` (R24); sign-in drops the deep link (R25); nothing shows
  that results are refreshing (R26); Settings shows the user id instead of the e-mail (R27);
  unhandled rejections on saved-search delete and sign-out (R28); the search cache, including
  queries, survives sign-out (R30); smaller ones in R31-R33.
- The production `dist/` built for the real backend contains the mock dataset and the demo password,
  because the factory imports both adapters statically (R37).
- The backend moved on after the desktop inventory: `jobs.parsed_json` (migration `20260520120001`:
  sections plus a normalized tech stack) and per-section AI embeddings (`20260520120003`;
  `match_jobs_ai` now also returns `seniority`, `description_snippet` and country codes). The web
  fetches `parsed_json` and drops it. Jobs without `parsed_json` are invisible to AI search.
  `search_jobs` is unchanged since `20260505120003`, so the adapter contract still holds.
- Retention: jobs are **hard-deleted** after `MAX_JOB_AGE_DAYS` (default 10, `20260509120001`). So
  saved jobs need a snapshot or a cleanup exemption, a "posted within 30 days" filter would be
  meaningless, and old links end in "Not found".
- The desktop reads `query_json` keys by name and ignores unknown ones
  (`apps/desktop/lib/models/saved_search.dart`), so new keys (relative dates, AI mode) are safe as
  long as existing keys keep their meaning.
- The `ai-job-search` source still rejects `OPTIONS` with 405, consistent with the live probe in
  the previous entry.

**Verification:** `pnpm test`: 5 files, 61 passed (baseline, unchanged). Sanitizer behavior checked
with a throwaway script (DOMPurify 3.4.18 + jsdom, same options as `HtmlContent`). The `dist/`
finding comes from a text search of the built bundle. Backend facts come from reading the migrations
and function source in the `JobObserver` repo (commit `13d6cd2`), **not** from the live project.
**Not verified:** whether the live database has the `2026052*` migrations applied; nothing was run
in a browser. Sizes in the roadmap are estimates. The list of features typical for comparable
products comes from general product knowledge, not from a fresh market survey.

**Follow-ups:** R19 and R20 first (no prerequisites, highest risk), then R21, R4, and R3 with R5.
D1-D9 go to the owner.
