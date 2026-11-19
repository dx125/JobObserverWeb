# Decision history

Architecture Decision Records (ADRs), newest last. One entry per decision that is expensive to
reverse or that a future reader would otherwise have to reverse-engineer. Entries are **never
rewritten**: if a decision changes, add a new ADR and mark the old one `Superseded by ADR-xxx`.

Format: **Context** (forces at play) -> **Decision** -> **Consequences** (including the downsides we
accepted) -> **Status**.

Index: [001](#adr-001) repo & ports/adapters - [002](#adr-002) stack - [003](#adr-003) reuse
Supabase - [004](#adr-004) mock backend - [005](#adr-005) URL as search state - [006](#adr-006)
cache - [007](#adr-007) sanitization - [008](#adr-008) auth required - [009](#adr-009) domain
models - [010](#adr-010) deviations from desktop - [011](#adr-011) router - [012](#adr-012) testing
- [013](#adr-013) CORS on ai-job-search - [014](#adr-014) docs policy - [015](#adr-015) any-credentials demo flag

---

## ADR-001
### Separate repo; backend independence via ports and adapters

- **Date:** 2026-11-19
- **Context:** The desktop app (`JobObserver`, Flutter) talks to Supabase directly from its DAL
  classes. We want a web client in its own repo that still reaches 100% of the desktop's
  functionality, but must not be welded to Supabase: the backend may change, and a sandbox without
  any backend must exist.
- **Decision:** All backend access goes through the interfaces in `src/core/ports.ts`
  (`AuthPort`, `JobsPort`, `SavedSearchPort`, bundled as `Backend`). Services (`src/core/services`)
  hold the business rules and depend only on ports. Concrete adapters live in `src/adapters/*`.
  Only `src/app/backend-factory.ts` imports adapters. This mirrors the desktop's own
  `abstract interface class XxxDal` + service split, so the two codebases stay conceptually aligned.
- **Consequences:** + swapping/adding a backend is one adapter + one factory branch; + UI and
  services are testable with fakes; - a thin mapping layer to maintain; - a port can only express
  what *every* adapter can do (we accept that: the ports mirror the desktop DAL).
- **Status:** Accepted.

## ADR-002
### Vite + React + TypeScript single-page app; no UI kit, no state library

- **Date:** 2026-11-19
- **Context:** The app is a logged-in tool (search, detail, saved searches, settings), not a public
  content site: no SEO or SSR need. The desktop UI is small (6 pages). The owner already uses
  TypeScript + pnpm in `JobObserver`.
- **Decision:** Vite SPA, React 18, `react-router-dom` 6, TypeScript strict
  (`noUncheckedIndexedAccess` on), hand-written CSS with design tokens and `prefers-color-scheme`
  dark mode. Async state is a ~30-line `useAsync` hook (stale-response safe). No Redux/Zustand/TanStack
  Query, no component library.
- **Consequences:** + tiny dependency surface (5 runtime deps), ~139 kB gzip; - no request
  de-duplication or background refetch (TanStack Query would add that; revisit if lists get
  pagination/infinite scroll - see ROADMAP); - accessibility and responsiveness are on us (done by
  hand: labelled controls, `aria-pressed` toggles, live regions, focus styles, <=760 px layout).
- **Status:** Accepted.

## ADR-003
### Reuse the existing Supabase backend unchanged

- **Date:** 2026-11-19
- **Context:** Desktop and web must show the same data and share accounts / saved searches.
- **Decision:** The Supabase adapter calls exactly what the desktop calls: RPC `search_jobs`, tables
  `jobs`, `job_sources`, `saved_searches` (protected by RLS), Edge Function `ai-job-search`, GoTrue
  e-mail/password auth. The browser only ever receives the **anon key**; the service-role key is
  never configured here. `saved_searches.query_json` is written with the desktop's exact key names so
  a search saved on one client opens on the other. The full contract is in
  [BACKEND_CONTRACT.md](BACKEND_CONTRACT.md).
- **Consequences:** + zero backend work for parity, one source of truth; - the web inherits backend
  limits (e.g. `search_jobs` has no total count, so no "page 3 of 9"); - one **required backend change**
  for AI search in browsers, see [ADR-013](#adr-013).
- **Status:** Accepted.

## ADR-004
### The mock backend is a first-class adapter and the default when nothing is configured

- **Date:** 2026-11-19
- **Context:** Developing UI, demoing, and running tests must work with no network, no Supabase
  project and no secrets.
- **Decision:** `src/adapters/mock` implements the full `Backend` port in memory (seeded 61-job
  dataset, filters, sort modes, mock AI search + planner, demo account, saved searches persisted in
  `localStorage`). `readConfig` picks it when `VITE_BACKEND=mock` **or** when Supabase variables are
  absent. A "Sandbox" badge and demo-credentials banner make the mode unmistakable. See
  [MOCK_BACKEND.md](MOCK_BACKEND.md).
- **Consequences:** + `pnpm dev:mock` works on a fresh clone; the UI test-suite runs against it; -
  the mock reproduces the **contract**, not Postgres ranking, so ranking quality must still be judged
  against the real backend; - the mock can drift from the real backend, mitigated by mapper tests that
  pin the wire format ([ADR-012](#adr-012)).
- **Status:** Accepted.

## ADR-005
### The URL is the search state

- **Date:** 2026-11-19
- **Context:** On desktop, filters live in a global Riverpod provider, so returning from a job's
  detail page keeps the results. In a browser, component state would be lost on navigation/reload and
  searches could not be shared or bookmarked.
- **Decision:** Query, every filter, sort and the AI toggles are encoded in the query string
  (`src/core/search-params.ts`: `q, remote, scope, emp, sen, cc, sal, after, sort, ai, planner`).
  The search page derives its state from `useSearchParams`; updates use `replace` so typing/toggling
  does not flood history. Detail -> back uses history (`navigate(-1)`) so the previous URL, hence
  filters, is restored; deep links fall back to a plain link to `/search`.
- **Consequences:** + shareable, reload-safe, back-button correct, saved searches can be "run" with a
  plain link; - URLs get long with many filters (acceptable); - sharing a link to a signed-in-only app
  still needs the recipient to sign in (see [ADR-008](#adr-008)).
- **Status:** Accepted.

## ADR-006
### Standard-search cache: `localStorage`, 30 min TTL, namespaced per backend

- **Date:** 2026-11-19
- **Context:** Desktop caches standard search results in SQLite (`search_cache`, 30 min TTL) and
  exposes "Clear local search cache". SQLite is not available in a browser.
- **Decision:** `SearchCache` over a `KeyValueStore` port (browser `localStorage`, in-memory for
  tests). Same TTL and same rule (standard search cached, AI search **never** cached). Keys are
  `jo:<backendId>:search:<json(filters,limit,offset)>` so mock and Supabase results never mix on one
  origin. Capped at 50 entries (oldest evicted); every storage call is guarded (private mode, quota).
- **Consequences:** + parity, trivial to test; - `localStorage` is ~5 MB and synchronous; fine for
  50 x 50 hits. If result payloads grow, move to IndexedDB behind the same port.
- **Status:** Accepted.

## ADR-007
### Treat scraped content as hostile: sanitize HTML, allow only http(s) links

- **Date:** 2026-11-19
- **Context:** Job descriptions and URLs come from third-party sources (ATS APIs, Telegram, scrapers).
  The desktop renders them with `flutter_html` and `launchUrl`; in a browser, the same data can become
  stored XSS on the app's origin - which also holds the user's Supabase session.
- **Decision:** `descriptionHtml` is always passed through DOMPurify (`HtmlContent`) and injected only
  after sanitization; anchors get `target=_blank rel="noopener noreferrer"`. Every `href` rendered
  from job/source data goes through `safeExternalUrl` (http/https only; `javascript:`/`data:` are
  dropped). The mock dataset contains a deliberately hostile "Sandbox Sanitization Fixture" job and a
  test asserts that scripts, `onerror` handlers and `javascript:` links do not survive (the test was
  verified to fail with sanitization disabled).
- **Consequences:** + defence in depth against bad source data; - sanitization may strip exotic markup
  from legitimate descriptions (acceptable; plain-text fallback exists).
- **Status:** Accepted.

## ADR-008
### Sign-in required for every page (desktop parity)

- **Date:** 2026-11-19
- **Context:** The desktop router redirects every unauthenticated user to `/login`, even though RLS
  already allows anonymous reads of `jobs` and `job_sources` (AI search genuinely needs a JWT).
- **Decision:** Keep parity: signed-out -> `/login`; signed-in at `/login` -> `/search`.
- **Consequences:** + identical behavior; - no public/SEO-able job pages. A public browse mode is
  technically possible without backend changes and is tracked in the ROADMAP as a product decision.
- **Status:** Accepted (revisit via ROADMAP "Public browsing").

## ADR-009
### Backend-neutral domain models: camelCase, ISO-string dates

- **Date:** 2026-11-19
- **Context:** The desktop models carry `DateTime` and snake_case factories. In TS, `Date` objects do
  not survive `JSON.stringify` (cache, URL, mock storage) without revival code.
- **Decision:** Domain types (`src/core/models.ts`) use camelCase and ISO-8601 **strings** for dates;
  `SearchSort` uses the same literals the desktop serializes (`relevance | recent | salaryDesc`).
  Wire-format knowledge (snake_case columns, RPC argument names, `final_score`) lives exclusively in
  `src/adapters/supabase/mappers.ts`.
- **Consequences:** + models are trivially serializable and backend-agnostic; - date math parses
  strings at the edges (`formatPosted`).
- **Status:** Accepted.

## ADR-010
### Intentional deviations from the desktop behavior

- **Date:** 2026-11-19
- **Context:** Parity is the floor, not a ceiling, but every difference must be a conscious choice.
- **Decision / consequences:**
  1. **Min-salary slider commits on release** (desktop fires a request per step). Value 0 means "any"
     and is not sent (desktop sends `salary_min_filter: 0`, which is equivalent in SQL).
  2. **Sign-up with e-mail confirmation:** desktop navigates to `/search`, which immediately bounces
     back to login with no explanation. Web shows "Check your e-mail to confirm your account".
  3. **Saved searches can be run** ("Run" link) - the desktop lists and deletes them but cannot open
     them. Rename exists in the service layer (as on desktop) but has no UI yet (ROADMAP).
  4. **Back navigation** restores the previous results via history ([ADR-005](#adr-005)).
  5. **Errors from Supabase** are shown with the server message; AI failures include HTTP status
     and body like the desktop's exception text.
  6. **"Sign out"** also reachable only from Settings (same as desktop); no user menu yet.
- **Status:** Accepted. Tracked row-by-row in [FEATURE_PARITY.md](FEATURE_PARITY.md).

## ADR-011
### `BrowserRouter` (clean URLs) with SPA fallback

- **Date:** 2026-11-19
- **Context:** `/jobs/:id` deep links should be clean paths; `HashRouter` works on any static host
  but yields `/#/jobs/...`.
- **Decision:** `BrowserRouter`. Hosting must rewrite unknown paths to `index.html` (Netlify
  `_redirects`, Vercel rewrites, Cloudflare Pages, nginx `try_files`). Vite dev/preview already do.
- **Consequences:** + clean URLs; - one hosting requirement, documented in the README. Revisit
  (-> `HashRouter`) only if a host cannot do rewrites.
- **Status:** Accepted.

## ADR-012
### Testing strategy: contract tests at the seams, UI tests against the mock, no live-backend tests

- **Date:** 2026-11-19
- **Context:** CI must be hermetic and free; the real backend costs Gemini tokens per AI call.
- **Decision:** Vitest + jsdom + Testing Library. (a) Core/service tests with fake ports; (b) Supabase
  adapter tests with a fake `SupabaseClient` that pin **exact RPC argument names, Edge Function body,
  `query_json` keys and row mapping** - this is the parity safety net; (c) mock-backend tests of the
  contract it claims to reproduce; (d) UI integration tests that drive the routed app against the mock
  (auth guard, search, filters, AI fallback banner, save/list/delete, settings, job detail, XSS).
- **Consequences:** + fast (~10 s), deterministic; - nothing proves the *live* backend still matches the
  mappers. Mitigation: a manual smoke checklist in BACKEND_CONTRACT.md; an opt-in live smoke test is in
  the ROADMAP.
- **Status:** Accepted.

## ADR-013
### AI search from a browser requires CORS support in the `ai-job-search` Edge Function

- **Date:** 2026-11-19
- **Context:** The desktop calls the function from a native HTTP client, which ignores CORS. A browser
  sends an `OPTIONS` preflight (custom `authorization`/`apikey` headers + JSON body). The function
  currently does `if (req.method !== 'POST') return errorResponse('method not allowed', 405)` and none
  of its responses carry `Access-Control-Allow-*` headers, so **every browser call fails**.
  (`search_jobs` and the table reads go through PostgREST, which handles CORS itself - unaffected.)
- **Decision:** Do **not** change the desktop repo's backend from here. Ship the web client with the AI
  adapter written against the final contract, document the exact patch
  ([BACKEND_CONTRACT.md#required-backend-change-cors](BACKEND_CONTRACT.md#required-backend-change-cors)),
  and have the owner apply and deploy it. Until then the web UI surfaces the failure as a normal error
  on the AI path (standard search is unaffected). The mock backend does not need it.
- **Consequences:** - AI search on the web is **blocked on a backend deploy** (small change, in the
  `JobObserver` repo); + no hidden cross-repo edits.
- **Status:** **Open** - awaiting the backend patch. Update this entry (new ADR) when applied.

## ADR-014
### Documentation policy: every move, intention and decision is recorded

- **Date:** 2026-11-19
- **Context:** The owner wants the project's reasoning to be recoverable by anyone (human or agent).
- **Decision:** Four living documents with distinct jobs - never mixed:
  - `DEVELOPMENT_LOG.md` - **what happened and why**, chronological, append-only (moves + intentions).
  - `DECISIONS.md` (this file) - **why we chose X over Y**, ADRs, append-only.
  - `ROADMAP.md` - **what is planned**, prioritized, with status; items move to the log when done.
  - `FEATURE_PARITY.md` / `BACKEND_CONTRACT.md` / `ARCHITECTURE.md` / `MOCK_BACKEND.md` - **how it is**
    (reference; edited in place and kept true).
  `CLAUDE.md` makes updating them part of the definition of done for any change.
- **Consequences:** + nothing important lives only in someone's head; - small per-change overhead.
- **Status:** Accepted.

## ADR-015
### "Any credentials work" is an opt-in flag of the mock adapter, never of real auth

- **Date:** 2026-11-19
- **Context:** The owner asked for a production-style launch where, for now, any credentials work.
  The real Supabase backend authenticates against actual accounts (and no credentials are available
  to this project yet), so "any credentials" can only be true for a backend that has no real users.
- **Decision:** `VITE_MOCK_ANY_CREDENTIALS=true` makes the **mock** adapter sign in any e-mail/password
  (account created on first use, identity stable per e-mail, password ignored). It is off by default,
  parsed strictly (`'true'` only), read at build time, and surfaced to the UI through
  `Backend.sandbox.acceptsAnyCredentials` so the login page says "Demo mode" instead of implying real
  security. The Supabase adapter has no such switch. The demo is launched with
  `VITE_BACKEND=mock VITE_MOCK_ANY_CREDENTIALS=true pnpm build && pnpm preview` - the flags are passed on
  the command line, **not** committed in an `.env.production`, so a later real build cannot inherit them
  by accident.
- **Consequences:** + a clickable production build for demos; - such a build must never front real
  data: it is a demo, not authentication. Replace by real Supabase config when credentials exist
  (ROADMAP R2/R3).
- **Status:** Accepted (temporary by intent).
