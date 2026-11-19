// Runtime configuration, resolved from Vite env vars (see .env.example).
// Pure function over a plain record so it is unit-testable.

import type { SupabaseConfig } from '../adapters/supabase/supabase-backend';

export type BackendKind = 'mock' | 'supabase';

export interface AppConfig {
  backend: BackendKind;
  supabase: SupabaseConfig | null;
  mockLatencyMs: number;
  /** mock backend only: any e-mail/password signs in (VITE_MOCK_ANY_CREDENTIALS=true) */
  mockAnyCredentials: boolean;
  /** true when the supabase backend was requested but URL / anon key are missing */
  setupRequired: boolean;
}

type Env = Record<string, string | boolean | undefined>;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function readConfig(env: Env): AppConfig {
  const url = text(env.VITE_SUPABASE_URL);
  const anonKey = text(env.VITE_SUPABASE_ANON_KEY);
  const hasSupabase = url !== '' && anonKey !== '';
  const requested = text(env.VITE_BACKEND);

  // Explicit choice wins. Unset: use Supabase when configured, otherwise the sandbox.
  const backend: BackendKind =
    requested === 'supabase' || requested === 'mock' ? requested : hasSupabase ? 'supabase' : 'mock';

  const latency = Number(text(env.VITE_MOCK_LATENCY_MS));
  return {
    backend,
    supabase: hasSupabase ? { url, anonKey } : null,
    mockLatencyMs: Number.isFinite(latency) && latency > 0 ? latency : 0,
    mockAnyCredentials: text(env.VITE_MOCK_ANY_CREDENTIALS) === 'true',
    setupRequired: backend === 'supabase' && !hasSupabase,
  };
}
