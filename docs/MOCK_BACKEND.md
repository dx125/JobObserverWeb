# Mock backend (sandbox)

`src/adapters/mock/` - a complete in-browser implementation of the `Backend` port for development,
demos and tests. No network, no secrets. See [ADR-004](DECISIONS.md#adr-004).

## Using it

```bash
pnpm dev:mock          # forces VITE_BACKEND=mock via .env.mock (250 ms latency to show loading states)
pnpm dev               # mock too, unless Supabase vars are configured in .env.local
```

Sign in with **`demo@example.com` / `demo1234`** (the login page shows this and a "Fill demo account"
button) or sign up with any e-mail and a password of 6+ characters (no confirmation step in the sandbox).

### Demo build: any credentials work

For a production-style build that anyone can click through without knowing the demo account:

```bash
VITE_BACKEND=mock VITE_MOCK_ANY_CREDENTIALS=true pnpm build && pnpm preview
```

Any e-mail + password signs in (the account is created on first use and keeps its saved searches;
the password is ignored). The login banner says "Demo mode". The flag is off by default, is inlined
at build time, and exists only in the mock adapter - the Supabase adapter has no equivalent, so it
cannot weaken real authentication ([ADR-015](DECISIONS.md#adr-015)). Do not deploy such a build in
front of real data.

## What it reproduces

| Area | Behavior |
| --- | --- |
| Dataset | 60 generated jobs (seeded PRNG -> identical on every load, dates relative to "now") + 1 hostile fixture job. Mixed remote types/scopes, employment, seniority, ~30% without salary, ~1 in 7 without HTML description, 1-3 sources each. |
| `search` | Same predicates as `search_jobs`: filters per dimension, salary = `coalesce(max, min, 0) >= x`, `posted_after`, AND keyword semantics, sort `relevance` / `recent` / `salaryDesc` (nulls last), `limit` / `offset`. |
| `aiSearch` | **401 when signed out** (like the `verify-jwt` function); OR-match with a tiny synonym map; threshold 0.25; `final_score = 0.75*similarity + 0.15*quality + 0.10*recency`; planner flag extracts remote/seniority/employment/"europe" from the text, **UI filters override planner output**. |
| Auth | Users + session persisted in `localStorage`; "Invalid login credentials" and "User already registered" errors; session survives reload; subscribers notified. |
| Saved searches | Per user, newest-updated first, create/rename/remove, persisted. |
| Jobs / sources | `getJob` returns `null` for unknown ids; sources sorted by `lastSeenAt` desc. |

## What it deliberately does NOT reproduce

- Postgres full-text ranking, canonicalization (`C#` -> `csharp`), quality scores, dedup clustering.
- E-mail confirmation, password rules beyond the client check, rate limits, token costs.
- The CORS requirement of the real Edge Function ([ADR-013](DECISIONS.md#adr-013)). **Passing in the
  sandbox does not prove AI search works against the real backend.**

## Fixture: `mock-job-fixture-xss`

"Sandbox Sanitization Fixture" has a `<script>`, an `onerror` image, a `javascript:` link, and
`javascript:` canonical/source URLs. Open `/jobs/mock-job-fixture-xss` to eyeball that none of it is
live; `ui/app.test.tsx` asserts it automatically.

## Persistence keys (clear them to reset the sandbox)

`jo:mock:users`, `jo:mock:session`, `jo:mock:saved`, and `jo:mock:search:*` cache entries
(Settings -> "Clear local search cache" removes only the cache).

## Tests

`mock-backend.test.ts` pins the contract above; the UI tests in `src/ui/app.test.tsx` run the whole
routed app against it. Inject `{ store, now, jobs, latencyMs }` into `createMockBackend` for
deterministic tests.
