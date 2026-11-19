# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repository.

## What this is

Backend-independent web client for JobObserver (React + TypeScript + Vite). Desktop counterpart:
`../JobObserver/apps/desktop` (Flutter) - **feature parity with it is a requirement**
(`docs/FEATURE_PARITY.md`). Read `docs/ARCHITECTURE.md` before changing structure.

## Commands

```bash
pnpm install
pnpm dev:mock        # sandbox backend, no secrets
pnpm dev             # auto: Supabase if .env.local has the vars, else sandbox
pnpm test            # must pass before you call anything done
pnpm typecheck
pnpm build
```

## Architecture rules (enforced by review; they are the point of the repo)

1. `src/core/**` imports nothing from `ui/`, `app/` or `adapters/`, and no framework/SDK types.
2. `src/ui/**` never imports from `src/adapters/**`. Reach services via `useApp()`.
3. Only `src/app/backend-factory.ts` imports concrete adapters.
4. Wire formats (snake_case columns, RPC argument names, Edge Function bodies) live only in
   `src/adapters/<name>/`. Domain models are camelCase with ISO-string dates.
5. Anything rendered from job data is untrusted: HTML goes through `HtmlContent`, URLs through
   `safeExternalUrl` (ADR-007). Never `dangerouslySetInnerHTML` raw data.
6. Only the Supabase **anon** key may appear in this repo's config. Never the service-role key.
7. A new backend capability = extend the port, update **both** adapters and their tests.

## Documentation rule (part of "done")

Every move, intention and decision is recorded - see ADR-014. For any non-trivial change, in the same
change set:

- Append an entry to `docs/DEVELOPMENT_LOG.md` (intent, done, findings, **how it was verified and what
  was not**, follow-ups). Append-only: never rewrite history; correct it with a new entry.
- Add an ADR to `docs/DECISIONS.md` for any decision that is costly to reverse. Supersede, don't edit.
- Update `docs/ROADMAP.md` (remove finished items - they are in the log; add newly discovered ones).
- Keep reference docs true when behavior changes: `FEATURE_PARITY.md`, `BACKEND_CONTRACT.md`,
  `ARCHITECTURE.md`, `MOCK_BACKEND.md`.

## Testing conventions

- Vitest + jsdom + Testing Library; tests are colocated (`*.test.ts[x]`) and hermetic (no network).
- Adapter wire format changes must update `src/adapters/supabase/supabase.test.ts` - it is the parity
  safety net against the desktop's calls.
- UI tests run the routed app against the mock backend (`src/ui/app.test.tsx`).
- When a test passes on first run, ask whether it can fail: mutate the code under test once (see the
  XSS test's verification in the development log).

## Gotchas

- `VITE_*` env values are inlined at build time; restart the dev server after editing `.env.local`.
- `ai-job-search` needs CORS in the backend before AI search works in browsers (ADR-013).
- `.env.local` and other `.env*` files are git-ignored except `.env.example` and `.env.mock`.
- Do not claim live-backend behavior from sandbox results: the mock reproduces the contract only.
