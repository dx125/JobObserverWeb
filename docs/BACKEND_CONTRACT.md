# Backend contract (Supabase adapter)

What the web client sends to and expects from the existing JobObserver Supabase project - the same
project the desktop app uses. Derived from the desktop DAL (`apps/desktop/lib/dal/*`) and the
`JobObserver` migrations (`apps/api-functions/supabase/migrations/*`). If this file and
`src/adapters/supabase/mappers.ts` disagree, the mappers' tests are the source of truth for *our*
side and the migrations for the backend's side.

All of it is implemented in `src/adapters/supabase/` and pinned by `supabase.test.ts`.

## Credentials

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build time | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | build time | Public by design; RLS enforces access. **Never** use the service-role key. |

Vite inlines `VITE_*` values into the bundle at build time (like the desktop's `--dart-define`).

## Operations

| Port method | Supabase call | Notes |
| --- | --- | --- |
| `auth.signInWithPassword` | `auth.signInWithPassword({email,password})` | errors surfaced verbatim |
| `auth.signUp` | `auth.signUp({email,password})` | `needsConfirmation = (session == null)` |
| `auth.signOut` | `auth.signOut()` | |
| `auth.subscribe` | `auth.onAuthStateChange` | emits `INITIAL_SESSION` on subscribe |
| `jobs.search` | RPC `search_jobs` | argument names below |
| `jobs.aiSearch` | Edge Function `ai-job-search` (POST JSON) | needs a JWT (`verify-jwt`) and CORS, see below |
| `jobs.getJob` | `from('jobs').select('*').eq('id',id).maybeSingle()` | RLS: `status = 'active'` only |
| `jobs.getSources` | `from('job_sources').select('*').eq('job_id',id).order('last_seen_at',desc)` | |
| `savedSearches.list` | `from('saved_searches').select('*').eq('user_id',uid).order('updated_at',desc)` | RLS: owner only |
| `savedSearches.create` | `insert({user_id,name,query_json}).select().single()` | |
| `savedSearches.remove` | `delete().eq('id',id)` | |
| `savedSearches.rename` | `update({name,updated_at}).eq('id',id).select().single()` | |

### `search_jobs` arguments

Latest signature: migration `20260505120003_fix_rank_weights.sql`. We send **all** arguments, with
`null` for "no filter" (as the desktop does):

`q`, `remote_types[]`, `remote_scopes[]`, `employment_types[]`, `seniorities[]`, `country_codes[]`,
`salary_min_filter`, `salary_max_filter` (always `null`), `posted_after`, `sort_mode`
(`relevance | recent | salary_desc`), `result_limit` (50), `result_offset` (0).

Returned columns used: `job_id, title, company_name, location_raw, remote_type, remote_scope,
employment_type, salary_min, salary_max, salary_currency, posted_at, first_seen_at, last_seen_at,
rank, source_count`.

> Pitfall (from the desktop project's notes): Postgres function overloads break PostgREST RPC
> (`PGRST203`). If `search_jobs` ever changes signature, drop the old signature in the migration and
> update `searchRpcParams` + its test in the same change.

### `ai-job-search` request / response

```jsonc
// POST  {SUPABASE_URL}/functions/v1/ai-job-search      (supabase-js: functions.invoke)
{
  "query": "remote senior Go role in Europe",
  "limit": 20,
  "use_query_planner": false,
  "filters": {                       // omitted when empty
    "remote_type": "remote",         // sent only when exactly ONE value is selected in the UI
    "remote_scope": "region",        // idem
    "employment_type": "full_time",  // idem
    "seniority": "senior",           // idem
    "country_codes": ["DE", "NL"],   // all selected
    "salary_min_required": 90000,
    "posted_after": "2026-06-01T00:00:00.000Z"
  }
}
// 200 -> { "results": [ { job_id, title, ..., final_score } ], used_planner, planner_confidence, ... }
```

Multi-select filters are collapsed because the function takes one value per dimension (same rule as
the desktop `JobDal.aiSearch`). `final_score` is shown as `rank`.

### `saved_searches.query_json`

Written with the desktop's exact keys so a search saved on either client opens on the other:

```json
{ "q": "", "remote_types": [], "remote_scopes": [], "employment_types": [], "seniorities": [],
  "country_codes": [], "salary_min": null, "posted_after": null, "sort": "relevance" }
```

`sort` is the Dart enum name: `relevance | recent | salaryDesc`.

## Required backend change: CORS

**Status: open (ADR-013). Blocks AI search in browsers; nothing else.**

The Edge Function must answer the browser's preflight and add CORS headers to *every* response
(including errors). Suggested patch in the `JobObserver` repo
(`apps/api-functions/supabase/functions/`):

```ts
// _shared/http.ts
const allowOrigin = Deno.env.get('CORS_ALLOW_ORIGIN') ?? '*'; // set to the web app's origin in prod

export const corsHeaders = {
  'access-control-allow-origin': allowOrigin,
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  });
}
// errorResponse already goes through jsonResponse.
```

```ts
// ai-job-search/index.ts - first lines of the Deno.serve handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method not allowed', 405);
  // ...unchanged
```

Notes:

- `_shared/http.ts` is also used by the ingest functions; adding CORS headers there is harmless
  (they are called server-to-server) but you may prefer a separate helper.
- With `verify_jwt` enabled the platform checks the JWT **before** the handler, but it lets
  `OPTIONS` preflights through, so the handler above is reached.
- Prefer a concrete `CORS_ALLOW_ORIGIN` (the deployed web origin) over `*` in production.
- Redeploy: `supabase functions deploy ai-job-search` (keep JWT verification on).

Also set the Supabase **Auth -> URL configuration** site URL / redirect URLs to the web origin if
e-mail confirmation links should land on the web app.

## Manual smoke checklist (against a real project)

1. `VITE_BACKEND=supabase pnpm dev`, sign in with an existing desktop account.
2. Search `senior backend remote`: results appear; toggle filters, sort and min salary.
3. Open a job: description renders, Sources panel lists connectors, "View original" opens.
4. Save a search on web; confirm it appears in the desktop's saved list (and vice versa).
5. Enable AI search: results appear (requires the CORS patch). Enable the planner.
6. Sign out; confirm redirect to `/login`.
