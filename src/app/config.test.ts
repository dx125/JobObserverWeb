import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

describe('readConfig', () => {
  it('defaults to the sandbox when nothing is configured', () => {
    expect(readConfig({})).toMatchObject({ backend: 'mock', setupRequired: false, supabase: null });
  });

  it('auto-selects supabase when both vars are present', () => {
    const c = readConfig({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_ANON_KEY: 'k' });
    expect(c).toMatchObject({ backend: 'supabase', setupRequired: false, supabase: { url: 'https://x.supabase.co', anonKey: 'k' } });
  });

  it('requires setup when supabase is requested without credentials', () => {
    expect(readConfig({ VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: 'https://x' })).toMatchObject({ backend: 'supabase', setupRequired: true });
  });

  it('lets an explicit mock choice win over present credentials', () => {
    const c = readConfig({ VITE_BACKEND: 'mock', VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'k' });
    expect(c.backend).toBe('mock');
  });

  it('accepts any credentials only when explicitly enabled', () => {
    expect(readConfig({}).mockAnyCredentials).toBe(false);
    expect(readConfig({ VITE_MOCK_ANY_CREDENTIALS: 'yes' }).mockAnyCredentials).toBe(false);
    expect(readConfig({ VITE_MOCK_ANY_CREDENTIALS: 'true' }).mockAnyCredentials).toBe(true);
  });

  it('parses mock latency defensively', () => {
    expect(readConfig({ VITE_MOCK_LATENCY_MS: '250' }).mockLatencyMs).toBe(250);
    expect(readConfig({ VITE_MOCK_LATENCY_MS: 'abc' }).mockLatencyMs).toBe(0);
    expect(readConfig({ VITE_MOCK_LATENCY_MS: '-1' }).mockLatencyMs).toBe(0);
  });
});
