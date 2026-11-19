import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTERS, type SearchFilters } from '../../core/models';
import {
  aiHitFromRow, aiSearchBody, filtersFromQueryJson, filtersToQueryJson, hitFromRow,
  jobFromRow, savedSearchFromRow, searchRpcParams,
} from './mappers';
import { createSupabaseBackendFromClient } from './supabase-backend';

const NOW = '2026-06-30T00:00:00.000Z';
const full: SearchFilters = {
  q: 'go', remoteTypes: ['remote'], remoteScopes: ['region', 'worldwide'], employmentTypes: ['full_time', 'contract'],
  seniorities: ['senior'], countryCodes: ['DE'], salaryMin: 90000, postedAfter: '2026-06-01T00:00:00.000Z', sort: 'salaryDesc',
};

describe('mappers', () => {
  it('builds search_jobs RPC args exactly like the desktop (nulls for empty, snake sort)', () => {
    expect(searchRpcParams(EMPTY_FILTERS, 50, 0)).toEqual({
      q: null, remote_types: null, remote_scopes: null, employment_types: null, seniorities: null,
      country_codes: null, salary_min_filter: null, salary_max_filter: null, posted_after: null,
      sort_mode: 'relevance', result_limit: 50, result_offset: 0,
    });
    expect(searchRpcParams(full, 20, 40)).toMatchObject({
      q: 'go', remote_scopes: ['region', 'worldwide'], salary_min_filter: 90000,
      posted_after: '2026-06-01T00:00:00.000Z', sort_mode: 'salary_desc', result_limit: 20, result_offset: 40,
    });
  });

  it('collapses multi-select filters for ai-job-search (one value or omit)', () => {
    expect(aiSearchBody(full, 20, true)).toEqual({
      query: 'go', limit: 20, use_query_planner: true,
      filters: {
        remote_type: 'remote', seniority: 'senior', country_codes: ['DE'],
        salary_min_required: 90000, posted_after: '2026-06-01T00:00:00.000Z',
      },
    });
    expect(aiSearchBody({ ...EMPTY_FILTERS, q: 'x' }, 5, false)).toEqual({ query: 'x', limit: 5, use_query_planner: false });
  });

  it('round-trips saved-search query_json with the desktop key names', () => {
    const json = filtersToQueryJson(full);
    expect(Object.keys(json).sort()).toEqual(
      ['country_codes', 'employment_types', 'posted_after', 'q', 'remote_scopes', 'remote_types', 'salary_min', 'seniorities', 'sort'],
    );
    expect(filtersFromQueryJson(json)).toEqual(full);
    expect(filtersFromQueryJson({ sort: 'weird' }).sort).toBe('relevance');
  });

  it('maps rows with defaults for missing columns', () => {
    const h = hitFromRow({ job_id: 'j1', title: 'T', rank: 0.5, salary_min: 1000.9 }, NOW);
    expect(h).toMatchObject({ jobId: 'j1', remoteType: 'unknown', salaryMin: 1000, sourceCount: 1, firstSeenAt: NOW, postedAt: null });
    const ai = aiHitFromRow({ job_id: 'j2', final_score: 0.8, rank: 99, source_count: 7, first_seen_at: '2020-01-01T00:00:00Z' }, NOW);
    expect(ai).toMatchObject({ rank: 0.8, sourceCount: 1, firstSeenAt: NOW });
    expect(jobFromRow({ id: 'j', location_country_codes: ['DE', 5] }, NOW).countryCodes).toEqual(['DE']);
    expect(savedSearchFromRow({ id: 's', query_json: null }, NOW)).toMatchObject({ name: 'Untitled', filters: EMPTY_FILTERS });
  });
});

/** Chainable fake of the query builder: every method returns itself, awaiting yields `result`. */
function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
    b[m] = vi.fn(() => b);
  }
  b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return b;
}

describe('SupabaseBackend', () => {
  it('search() calls the search_jobs RPC and maps rows', async () => {
    const rpc = vi.fn(async () => ({ data: [{ job_id: 'j1', title: 'Go dev', rank: 1 }], error: null }));
    const be = createSupabaseBackendFromClient({ rpc } as unknown as SupabaseClient);
    const hits = await be.jobs.search(full, { limit: 10, offset: 5 });
    expect(rpc).toHaveBeenCalledWith('search_jobs', expect.objectContaining({ result_limit: 10, result_offset: 5 }));
    expect(hits[0]?.jobId).toBe('j1');
  });

  it('search() surfaces RPC errors', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error('boom') }));
    const be = createSupabaseBackendFromClient({ rpc } as unknown as SupabaseClient);
    await expect(be.jobs.search(EMPTY_FILTERS)).rejects.toThrow('boom');
  });

  it('aiSearch() invokes the Edge Function and maps final_score', async () => {
    const invoke = vi.fn(async () => ({ data: { results: [{ job_id: 'a', final_score: 0.9 }] }, error: null }));
    const be = createSupabaseBackendFromClient({ functions: { invoke } } as unknown as SupabaseClient);
    const hits = await be.jobs.aiSearch({ ...EMPTY_FILTERS, q: 'go' }, { limit: 7, useQueryPlanner: true });
    expect(invoke).toHaveBeenCalledWith('ai-job-search', { body: { query: 'go', limit: 7, use_query_planner: true } });
    expect(hits[0]).toMatchObject({ jobId: 'a', rank: 0.9 });
  });

  it('aiSearch() reports the HTTP status and body of a failed call', async () => {
    const context = { status: 401, text: async () => '{"msg":"Invalid JWT"}' };
    const invoke = vi.fn(async () => ({ data: null, error: { message: 'non-2xx', context } }));
    const be = createSupabaseBackendFromClient({ functions: { invoke } } as unknown as SupabaseClient);
    await expect(be.jobs.aiSearch({ ...EMPTY_FILTERS, q: 'go' })).rejects.toThrow('ai-job-search failed (401): {"msg":"Invalid JWT"}');
  });

  it('getJob() returns null for a missing row', async () => {
    const from = vi.fn(() => builder({ data: null, error: null }));
    const be = createSupabaseBackendFromClient({ from } as unknown as SupabaseClient);
    expect(await be.jobs.getJob('x')).toBeNull();
    expect(from).toHaveBeenCalledWith('jobs');
  });

  it('saved searches: insert uses the desktop payload shape', async () => {
    const b = builder({ data: { id: 's1', name: 'N', query_json: filtersToQueryJson(full) }, error: null });
    const from = vi.fn(() => b);
    const be = createSupabaseBackendFromClient({ from } as unknown as SupabaseClient);
    const saved = await be.savedSearches.create('u1', 'N', full);
    expect(b.insert).toHaveBeenCalledWith({ user_id: 'u1', name: 'N', query_json: filtersToQueryJson(full) });
    expect(saved.filters).toEqual(full);
  });

  it('auth.signUp reports whether e-mail confirmation is pending', async () => {
    const signUp = vi.fn(async () => ({ data: { session: null }, error: null }));
    const be = createSupabaseBackendFromClient({ auth: { signUp } } as unknown as SupabaseClient);
    expect(await be.auth.signUp('a@b.c', 'secret1')).toEqual({ needsConfirmation: true });
  });

  it('auth.subscribe forwards the user id and unsubscribes', () => {
    const unsubscribe = vi.fn();
    let cb: (e: string, s: { user: { id: string } } | null) => void = () => {};
    const onAuthStateChange = vi.fn((fn: typeof cb) => {
      cb = fn;
      return { data: { subscription: { unsubscribe } } };
    });
    const be = createSupabaseBackendFromClient({ auth: { onAuthStateChange } } as unknown as SupabaseClient);
    const seen: (string | null)[] = [];
    const off = be.auth.subscribe((id) => seen.push(id));
    cb('INITIAL_SESSION', null);
    cb('SIGNED_IN', { user: { id: 'u9' } });
    off();
    expect(seen).toEqual([null, 'u9']);
    expect(unsubscribe).toHaveBeenCalled();
  });
});
