// The single place that knows which concrete adapters exist. Everything else depends on the
// `Backend` port. Adding a backend = one adapter + one branch here (docs/ARCHITECTURE.md).

import { BrowserKeyValueStore } from '../core/cache';
import type { Backend } from '../core/ports';
import { createMockBackend } from '../adapters/mock/mock-backend';
import { createSupabaseBackend } from '../adapters/supabase/supabase-backend';
import type { AppConfig } from './config';

export function createBackend(config: AppConfig): Backend | null {
  if (config.setupRequired) return null;
  if (config.backend === 'supabase' && config.supabase) {
    return createSupabaseBackend(config.supabase);
  }
  return createMockBackend({
    store: new BrowserKeyValueStore(),
    latencyMs: config.mockLatencyMs,
    acceptAnyCredentials: config.mockAnyCredentials,
  });
}
