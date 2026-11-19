# Feature parity with the desktop app

Every user-visible capability of the Flutter desktop app (`JobObserver/apps/desktop`, inventoried on
2026-11-19 from `lib/**`) and where it lives in the web client. Statuses: **Done**, **Changed**
(intentional deviation, see [ADR-010](DECISIONS.md#adr-010)), **Blocked**, **Missing**.

| # | Desktop capability (source) | Web | Status |
| - | --- | --- | --- |
| 1 | Config via `--dart-define` SUPABASE_URL / ANON_KEY; "needs configuration" page (`app_config`, `setup_required_page`) | `VITE_*` env, `readConfig`, `SetupRequiredPage` | Done |
| 2 | Router guard: signed-out -> `/login`, signed-in at `/login` -> `/search` (`router.dart`) | `App.tsx` `RequireAuth` / `LoginRoute` | Done |
| 3 | E-mail + password sign-in (`login_page`, `auth_service`) with "required" validation | `LoginPage`, `AuthService.signIn` | Done |
| 4 | Sign-up with min 6 chars password | `AuthService.signUp` | Done |
| 5 | Sign-up when e-mail confirmation is on (desktop: silent bounce to login) | `LoginPage` shows "Check your e-mail to confirm your account" | Changed |
| 6 | Sign out (Settings) | `SettingsPage` | Done |
| 7 | Navigation rail: Search / Saved / Settings | `AppShell` (rail; top bar on phones) | Done |
| 8 | Keyword search via `search_jobs` RPC, limit 50 | `SearchService.search` -> `SupabaseJobs.search` | Done |
| 9 | Filter: remote type (remote/hybrid/onsite), employment (4), seniority (6) multi-toggles | `FiltersPanel` | Done |
| 10 | Filter: min salary slider 0-250k step 10k | `FiltersPanel` | Changed (commit on release; 0 = any) |
| 11 | Sort: relevance / most recent / salary desc | `FiltersPanel`, `searchRpcParams` | Done |
| 12 | Query submit on Enter | `SearchBar` form | Done |
| 13 | Job card: title, company, location, remote, salary range, posted-ago, "N sources" | `JobCard`, `core/format.ts` | Done |
| 14 | Results empty state "No results"; errors "Error: ..." | `SearchPage` | Done |
| 15 | Filters kept while navigating to detail and back | URL state ([ADR-005](DECISIONS.md#adr-005)) | Done |
| 16 | Local search cache, 30 min TTL (SQLite) | `SearchCache` over localStorage ([ADR-006](DECISIONS.md#adr-006)) | Done |
| 17 | "Clear local search cache" | `SettingsPage` | Done |
| 18 | AI search opt-in checkbox + "Use query planner" (only when AI on) | `SearchBar` | Done |
| 19 | AI search -> `ai-job-search` Edge Function, filters collapsed to single values | `SupabaseJobs.aiSearch`, `aiSearchBody` | **Blocked** in browsers until CORS patch ([ADR-013](DECISIONS.md#adr-013)); works on mock |
| 20 | AI: empty query degrades to standard search; < 3 hits falls back; banner "AI search returned no strong matches..." | `SearchService.aiSearch`, `SearchPage` | Done |
| 21 | AI results never cached | `SearchService.aiSearch` | Done |
| 22 | Job detail: title, company, location, "View original", HTML description (fallback plain text) | `JobDetailPage`, `HtmlContent` | Done (+ sanitization, [ADR-007](DECISIONS.md#adr-007)) |
| 23 | Provenance panel: connector, instance key, source type, open source URL | `SourcesPanel` | Done |
| 24 | "Not found" for unknown job | `JobDetailPage` | Done |
| 25 | Save current search (name dialog) / "Please sign in to save searches" | `NamePromptDialog`, `SearchPage.save` | Done |
| 26 | Saved searches list with summary line and delete | `SavedSearchesPage`, `summarizeSavedSearch` | Done |
| 27 | Rename saved search (service only, no UI on desktop) | `SavedSearchService.rename` | Done (service) |
| 28 | Opening a saved search (not possible on desktop) | "Run" link on `SavedSearchesPage` | Added (web-only) |
| 29 | Material 3 theme seeded `#1F6FEB` | CSS tokens, same primary, + dark mode | Changed (cosmetic) |

## Known gaps (not in the desktop either)

`search_jobs` supports `salary_max_filter`, `posted_after` and `remote_scopes`; the desktop model has
them but exposes no UI. The web model/URL/adapters carry them end-to-end so adding UI is trivial -
see ROADMAP.
