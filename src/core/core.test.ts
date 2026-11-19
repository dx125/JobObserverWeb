import { describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStore, SearchCache } from './cache';
import { formatPosted, formatSalary, safeExternalUrl, summarizeSavedSearch } from './format';
import { EMPTY_FILTERS, type SearchFilters, type SearchHit } from './models';
import type { JobsPort } from './ports';
import { DEFAULT_MODE, paramsToState, stateToParams } from './search-params';
import { AI_MIN_HITS, SearchService } from './services/search-service';
import { AuthService } from './services/auth-service';
import { SavedSearchService } from './services/saved-search-service';

const hit = (id: string): SearchHit => ({
  jobId: id, title: id, companyName: 'c', locationRaw: null, remoteType: 'remote',
  remoteScope: 'unknown', employmentType: 'full_time', salaryMin: null, salaryMax: null,
  salaryCurrency: null, postedAt: null, firstSeenAt: '2026-01-01T00:00:00Z',
  lastSeenAt: '2026-01-01T00:00:00Z', rank: 1, sourceCount: 1,
});

function fakeJobs(over: Partial<JobsPort> = {}): JobsPort & { search: ReturnType<typeof vi.fn>; aiSearch: ReturnType<typeof vi.fn> } {
  return {
    search: vi.fn(async () => [hit('std')]),
    aiSearch: vi.fn(async () => [hit('a'), hit('b'), hit('c')]),
    getJob: vi.fn(async () => null),
    getSources: vi.fn(async () => []),
    ...over,
  } as never;
}

const newCache = (now = () => 1_000) =>
  new SearchCache(new MemoryKeyValueStore(), { namespace: 't', ttlMs: 1000, maxEntries: 3, now });

describe('SearchService', () => {
  it('caches standard searches per filter set', async () => {
    const jobs = fakeJobs();
    const svc = new SearchService(jobs, newCache());
    const f: SearchFilters = { ...EMPTY_FILTERS, q: 'go' };
    await svc.search(f);
    await svc.search(f);
    expect(jobs.search).toHaveBeenCalledTimes(1);
    await svc.search({ ...f, q: 'rust' });
    expect(jobs.search).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache with useCache=false and after clearCache', async () => {
    const jobs = fakeJobs();
    const svc = new SearchService(jobs, newCache());
    await svc.search(EMPTY_FILTERS);
    await svc.search(EMPTY_FILTERS, { useCache: false });
    expect(jobs.search).toHaveBeenCalledTimes(2);
    svc.clearCache();
    await svc.search(EMPTY_FILTERS);
    expect(jobs.search).toHaveBeenCalledTimes(3);
  });

  it('AI search with an empty query degrades to standard search without calling AI', async () => {
    const jobs = fakeJobs();
    const res = await new SearchService(jobs, newCache()).aiSearch({ ...EMPTY_FILTERS, q: '   ' });
    expect(jobs.aiSearch).not.toHaveBeenCalled();
    expect(res.usedFallback).toBe(true);
  });

  it(`AI search falls back when fewer than ${AI_MIN_HITS} hits`, async () => {
    const jobs = fakeJobs({ aiSearch: vi.fn(async () => [hit('a'), hit('b')]) });
    const res = await new SearchService(jobs, newCache()).aiSearch({ ...EMPTY_FILTERS, q: 'x' });
    expect(res.usedFallback).toBe(true);
    expect(res.hits.map((h) => h.jobId)).toEqual(['std']);
  });

  it('AI search returns AI hits (and never caches them) when strong enough', async () => {
    const jobs = fakeJobs();
    const svc = new SearchService(jobs, newCache());
    const f = { ...EMPTY_FILTERS, q: 'x' };
    const res = await svc.aiSearch(f, { useQueryPlanner: true });
    await svc.aiSearch(f);
    expect(res.usedFallback).toBe(false);
    expect(jobs.aiSearch).toHaveBeenCalledTimes(2);
    expect(jobs.aiSearch).toHaveBeenCalledWith(f, { limit: 20, useQueryPlanner: true });
  });
});

describe('SearchCache', () => {
  it('expires entries after the TTL', () => {
    let t = 0;
    const c = newCache(() => t);
    c.write('k', [hit('a')]);
    t = 999;
    expect(c.read('k')).not.toBeNull();
    t = 1001;
    expect(c.read('k')).toBeNull();
  });

  it('prunes the oldest entries beyond maxEntries', () => {
    let t = 0;
    const c = newCache(() => ++t);
    for (const k of ['a', 'b', 'c', 'd']) c.write(k, [hit(k)]);
    expect(c.read('a')).toBeNull();
    expect(c.read('d')).not.toBeNull();
  });

  it('survives corrupt entries', () => {
    const store = new MemoryKeyValueStore();
    store.set('jo:t:search:k', '{not json');
    expect(new SearchCache(store, { namespace: 't' }).read('k')).toBeNull();
  });

  it('namespaces by backend', () => {
    const store = new MemoryKeyValueStore();
    new SearchCache(store, { namespace: 'mock' }).write('k', [hit('a')]);
    expect(new SearchCache(store, { namespace: 'supabase' }).read('k')).toBeNull();
  });
});

describe('services validation', () => {
  const port = { subscribe: vi.fn(), signInWithPassword: vi.fn(async () => {}), signUp: vi.fn(async () => ({ needsConfirmation: false })), signOut: vi.fn() };
  it('AuthService enforces the desktop rules', async () => {
    const auth = new AuthService(port as never);
    await expect(auth.signIn('', 'x')).rejects.toThrow('required');
    await expect(auth.signUp('a@b.c', '12345')).rejects.toThrow('at least 6');
    await expect(auth.signUp('a@b.c', '123456')).resolves.toEqual({ needsConfirmation: false });
  });
  it('SavedSearchService trims and rejects blank names', async () => {
    const create = vi.fn(async (_u: string, name: string) => ({ name }) as never);
    const svc = new SavedSearchService({ create } as never);
    await expect(svc.save('u', '  ', EMPTY_FILTERS)).rejects.toThrow('Name is required');
    await svc.save('u', '  Go  ', EMPTY_FILTERS);
    expect(create).toHaveBeenCalledWith('u', 'Go', EMPTY_FILTERS);
    await expect(svc.rename('id', '')).rejects.toThrow('Name is required');
  });
});

describe('search-params codec', () => {
  it('round-trips every field', () => {
    const f: SearchFilters = {
      q: 'senior go', remoteTypes: ['remote', 'hybrid'], remoteScopes: ['region'],
      employmentTypes: ['contract'], seniorities: ['senior'], countryCodes: ['DE', 'NL'],
      salaryMin: 90000, postedAfter: '2026-01-01T00:00:00.000Z', sort: 'salaryDesc',
    };
    const p = stateToParams(f, { ai: true, planner: true });
    expect(paramsToState(new URLSearchParams(p.toString()))).toEqual({
      filters: f, mode: { ai: true, planner: true },
    });
  });

  it('defaults for empty/garbage input and ignores planner without ai', () => {
    const { filters, mode } = paramsToState(new URLSearchParams('sort=bogus&sal=-5&planner=1'));
    expect(filters).toEqual(EMPTY_FILTERS);
    expect(mode).toEqual(DEFAULT_MODE);
    expect(stateToParams(EMPTY_FILTERS, DEFAULT_MODE).toString()).toBe('');
  });
});

describe('format', () => {
  it('formats salary ranges, singles and none', () => {
    expect(formatSalary({ salaryMin: 80000, salaryMax: 120000, salaryCurrency: 'EUR' })).toBe('EUR 80k–120k');
    expect(formatSalary({ salaryMin: 90000, salaryMax: 90000, salaryCurrency: 'USD' })).toBe('USD 90k');
    expect(formatSalary({ salaryMin: null, salaryMax: 500, salaryCurrency: null })).toBe('500');
    expect(formatSalary({ salaryMin: null, salaryMax: null, salaryCurrency: 'USD' })).toBeNull();
  });

  it('formats relative posting dates', () => {
    const now = new Date('2026-06-30T12:00:00Z');
    expect(formatPosted('2026-06-30T11:59:00Z', now)).toBe('just now');
    expect(formatPosted('2026-06-30T09:00:00Z', now)).toBe('3h ago');
    expect(formatPosted('2026-06-27T12:00:00Z', now)).toBe('3d ago');
    expect(formatPosted('2026-01-05T12:00:00Z', now)).toMatch(/Jan 5, 2026/);
  });

  it('only allows http(s) links', () => {
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,x')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });

  it('summarizes saved searches like the desktop list', () => {
    const base = { id: '1', name: 'n', createdAt: '', updatedAt: '' };
    expect(summarizeSavedSearch({ ...base, filters: EMPTY_FILTERS })).toBe('(no filters)');
    expect(
      summarizeSavedSearch({ ...base, filters: { ...EMPTY_FILTERS, q: 'go', remoteTypes: ['remote', 'hybrid'], salaryMin: 90000 } }),
    ).toBe('"go" · remote/hybrid · ≥ $90k');
  });
});
