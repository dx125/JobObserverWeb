# Architecture

Reference document: edited in place, kept true. Rationale lives in [DECISIONS.md](DECISIONS.md).

## Layers and the dependency rule

```
 ui/            React pages & components         -> may import: app, core
 app/           config, DI context, hooks         -> may import: core, adapters (factory only)
 core/          models, ports, services, cache    -> imports NOTHING from ui/app/adapters
 adapters/      supabase/, mock/                  -> may import: core only
```

Concretely:

- `core/` is framework-free TypeScript (no React, no `fetch`, no Supabase types). It is the
  backend-independent heart: `models.ts` (domain types), `ports.ts` (interfaces), `services/*`
  (business rules), `cache.ts`, `search-params.ts` (URL codec), `format.ts`.
- `adapters/*` implement `Backend` from `ports.ts`. They are the only code that knows wire formats.
- `app/backend-factory.ts` is the **only** file that imports both adapters. `app/app-context.tsx`
  builds the services from a `Backend` and exposes them (plus the session user id) to the UI.
- `ui/` never imports an adapter. Sandbox-only affordances (demo credentials, badge) travel through
  the optional `Backend.sandbox` field, not through an import of the mock.

```
UI -> useApp() -> Services -> Ports <- Adapter (supabase | mock) -> network | memory+localStorage
```

## Ports (`src/core/ports.ts`)

| Port | Methods | Desktop counterpart |
| --- | --- | --- |
| `AuthPort` | `subscribe, signInWithPassword, signUp, signOut` | `AuthDal` |
| `JobsPort` | `search, aiSearch, getJob, getSources` | `JobDal` |
| `SavedSearchPort` | `list, create, remove, rename` | `SavedSearchDal` |
| `KeyValueStore` | `get, set, remove, keys` | SQLite `CacheDal` storage |
| `Backend` | `{ id, sandbox?, auth, jobs, savedSearches }` | Riverpod `service_locator.dart` |

Services (`core/services`): `AuthService` (validation), `SearchService` (cache + AI fallback),
`JobService`, `SavedSearchService` (name validation) - ports of the desktop services.

## Selecting a backend

`readConfig(import.meta.env)` -> `AppConfig`:

| `VITE_BACKEND` | Supabase vars | Result |
| --- | --- | --- |
| `mock` | any | mock adapter |
| `supabase` | both set | Supabase adapter |
| `supabase` | missing | `SetupRequiredPage` |
| unset | both set | Supabase adapter |
| unset | missing | mock adapter (sandbox) |

## Adding another backend (e.g. a REST API)

1. Create `src/adapters/<name>/<name>-backend.ts` exporting `create<Name>Backend(config): Backend`.
2. Keep wire-format mapping in a `mappers.ts` next to it and unit-test it (copy the pattern of
   `adapters/supabase/supabase.test.ts`).
3. Add the kind to `BackendKind` + a branch in `readConfig` and `createBackend`.
4. Record the decision in `DECISIONS.md`, and the contract in a `docs/` file like `BACKEND_CONTRACT.md`.

No change to `ui/` or `core/` should be needed. If one is, the port is missing something: fix the port.

## State and data flow

- **Session:** `AppProvider` subscribes to `AuthPort.subscribe`; `userId` is `undefined` (resolving),
  `null` (signed out) or a string. Guards in `App.tsx` wait on `undefined` to avoid a login flash.
- **Search state:** lives in the URL ([ADR-005](DECISIONS.md#adr-005)); `SearchPage` derives
  `{filters, mode}` from it and re-runs `useAsync` when the query string changes. `useAsync` drops
  responses of superseded runs.
- **Caching:** only `SearchService.search`; keyed by `{filters, limit, offset}`; per-backend namespace.

## Security notes

- Only the anon key reaches the browser; RLS is the access-control layer.
- Scraped HTML is sanitized with DOMPurify; only http(s) links are rendered ([ADR-007](DECISIONS.md#adr-007)).
- The mock stores demo passwords in clear text in `localStorage` - it is a sandbox, never a template
  for real auth.

## Directory map

```
src/
  core/        models.ts ports.ts format.ts cache.ts search-params.ts services/*
  adapters/
    supabase/  mappers.ts supabase-backend.ts
    mock/      data.ts search.ts mock-backend.ts
  app/         config.ts backend-factory.ts app-context.tsx use-async.ts
  ui/          pages/* components/*
  App.tsx main.tsx styles.css
docs/          this folder
```
