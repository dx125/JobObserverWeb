# JobObserver Web

Web client for JobObserver (the `JobObserver` repo holds the Flutter desktop app and the Supabase
backend): search the aggregated job index, open a job with its
provenance, save searches, and try optional AI (semantic) search. It reaches the same functionality as
the Flutter desktop app (see [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md)).

**Backend-independent by design.** The UI and business logic depend only on small interfaces
(`src/core/ports.ts`). Two adapters ship:

| Adapter | When | What it is |
| --- | --- | --- |
| `supabase` | `VITE_BACKEND=supabase` (or Supabase vars present) | The existing JobObserver Supabase project - same data and accounts as the desktop |
| `mock` | `VITE_BACKEND=mock` (or nothing configured) | In-browser sandbox with seeded data, demo account and a mock AI search - no network, no secrets |

## Quick start (sandbox, no backend needed)

```bash
pnpm install
pnpm dev:mock          # http://localhost:5173
```

Sign in with `demo@example.com` / `demo1234`, or sign up with anything.

## Run against the real Supabase project

```bash
cp .env.example .env.local     # then fill in the values
# VITE_BACKEND=supabase
# VITE_SUPABASE_URL=https://<ref>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon key>     # public key only - never the service-role key
pnpm dev
```

Use an existing desktop account. **AI search additionally needs a small CORS patch in the backend**
([docs/BACKEND_CONTRACT.md](docs/BACKEND_CONTRACT.md#required-backend-change-cors),
[ADR-013](docs/DECISIONS.md#adr-013)); everything else works without it.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` / `pnpm dev:mock` | Dev server (auto-selected backend / forced sandbox) |
| `pnpm test` | Unit + integration tests (hermetic, ~10 s) |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm build` | Typecheck + production bundle in `dist/` |
| `pnpm preview` | Serve the built bundle |

Requires Node >= 20 and pnpm 9.

## Deploying

`dist/` is a static site. `VITE_*` values are baked in at build time. The host must rewrite unknown
paths to `index.html` (SPA fallback) because the app uses clean URLs like `/jobs/<id>`
([ADR-011](docs/DECISIONS.md#adr-011)). Hosting target and CI are still open: see the
[roadmap](docs/ROADMAP.md).

## Project map

```
src/core/       backend-neutral models, ports, services, cache, URL codec   (no framework)
src/adapters/   supabase/ (real)  mock/ (sandbox)  - the only code that knows a backend
src/app/        config, adapter factory, DI context, hooks
src/ui/         pages and components (never import an adapter)
docs/           the project's memory - read it
```

## Documentation

| Doc | Answers |
| --- | --- |
| [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | What was done, when, why, and how it was verified |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why we chose X over Y (ADRs) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is planned, in priority order |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, ports, how to add a backend |
| [docs/BACKEND_CONTRACT.md](docs/BACKEND_CONTRACT.md) | Exactly what we call on Supabase, and the one backend change needed |
| [docs/FEATURE_PARITY.md](docs/FEATURE_PARITY.md) | Desktop feature -> web location/status |
| [docs/MOCK_BACKEND.md](docs/MOCK_BACKEND.md) | What the sandbox does and does not simulate |

Contributing rules (including the documentation rule) are in [CLAUDE.md](CLAUDE.md).

## License

MIT - see [LICENSE](LICENSE).
