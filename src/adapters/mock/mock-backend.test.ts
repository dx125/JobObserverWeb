import { describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from '../../core/cache';
import { EMPTY_FILTERS, type SearchFilters } from '../../core/models';
import { generateMockJobs } from './data';
import { createMockBackend, DEMO_USER } from './mock-backend';

const NOW = new Date('2026-06-30T12:00:00Z');
const make = (store = new MemoryKeyValueStore()) => ({
  store,
  be: createMockBackend({ store, now: () => NOW, jobs: generateMockJobs(NOW) }),
});
const f = (p: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, ...p });
const signIn = (be: ReturnType<typeof make>['be']) =>
  be.auth.signInWithPassword(DEMO_USER.email, DEMO_USER.password);

describe('mock data', () => {
  it('is deterministic and varied', () => {
    const a = generateMockJobs(NOW);
    const b = generateMockJobs(NOW);
    expect(a.map((j) => j.title)).toEqual(b.map((j) => j.title));
    expect(a.length).toBeGreaterThan(50);
    expect(new Set(a.map((j) => j.remoteType)).size).toBeGreaterThanOrEqual(3);
    expect(a.some((j) => j.salaryMin == null)).toBe(true);
    expect(a.some((j) => j.descriptionHtml == null)).toBe(true);
  });
});

describe('mock search (search_jobs contract)', () => {
  it('returns everything for an empty query, honoring limit/offset', async () => {
    const { be } = make();
    const all = await be.jobs.search(EMPTY_FILTERS, { limit: 1000 });
    const page = await be.jobs.search(EMPTY_FILTERS, { limit: 5, offset: 5 });
    expect(page.map((h) => h.jobId)).toEqual(all.slice(5, 10).map((h) => h.jobId));
  });

  it('applies every filter dimension', async () => {
    const { be } = make();
    const remote = await be.jobs.search(f({ remoteTypes: ['remote'] }), { limit: 1000 });
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.every((h) => h.remoteType === 'remote')).toBe(true);

    const contract = await be.jobs.search(f({ employmentTypes: ['contract'] }), { limit: 1000 });
    expect(contract.every((h) => h.employmentType === 'contract')).toBe(true);

    const rich = await be.jobs.search(f({ salaryMin: 100000 }), { limit: 1000 });
    expect(rich.every((h) => (h.salaryMax ?? h.salaryMin ?? 0) >= 100000)).toBe(true);

    const de = await be.jobs.search(f({ countryCodes: ['DE'] }), { limit: 1000 });
    expect(de.length).toBeGreaterThan(0);
    const senior = await be.jobs.search(f({ seniorities: ['senior'] }), { limit: 1000 });
    expect(senior.every((h) => h.title.startsWith('Senior'))).toBe(true);
  });

  it('keyword search uses AND semantics across title/company/body', async () => {
    const { be } = make();
    const go = await be.jobs.search(f({ q: 'go kubernetes' }), { limit: 1000 });
    expect(go.length).toBeGreaterThan(0);
    expect(await be.jobs.search(f({ q: 'go zzzznotaword' }))).toEqual([]);
  });

  it('sorts by recency and by salary (nulls last)', async () => {
    const { be } = make();
    const recent = await be.jobs.search(f({ sort: 'recent' }), { limit: 1000 });
    const times = recent.map((h) => Date.parse(h.postedAt ?? h.firstSeenAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const sal = await be.jobs.search(f({ sort: 'salaryDesc' }), { limit: 1000 });
    const vals = sal.map((h) => h.salaryMax ?? h.salaryMin);
    const firstNull = vals.indexOf(null);
    expect(vals.slice(firstNull).every((v) => v == null)).toBe(true);
    const nums = vals.slice(0, firstNull) as number[];
    expect(nums).toEqual([...nums].sort((a, b) => b - a));
  });
});

describe('mock AI search (ai-job-search contract)', () => {
  it('rejects anonymous callers like the verify-jwt Edge Function', async () => {
    const { be } = make();
    await expect(be.jobs.aiSearch(f({ q: 'go' }))).rejects.toThrow('401');
  });

  it('ranks by blended score and honors the planner', async () => {
    const { be } = make();
    await signIn(be);
    const plain = await be.jobs.aiSearch(f({ q: 'remote senior go role in europe' }), { limit: 50 });
    expect(plain.length).toBeGreaterThan(0);
    const ranks = plain.map((h) => h.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));

    const planned = await be.jobs.aiSearch(f({ q: 'remote senior go role in europe' }), { limit: 50, useQueryPlanner: true });
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((h) => h.remoteType === 'remote' && h.title.startsWith('Senior'))).toBe(true);
  });

  it('explicit UI filters win over planner output', async () => {
    const { be } = make();
    await signIn(be);
    const hits = await be.jobs.aiSearch(f({ q: 'remote engineer', remoteTypes: ['hybrid'] }), { limit: 50, useQueryPlanner: true });
    expect(hits.every((h) => h.remoteType === 'hybrid')).toBe(true);
  });
});

describe('mock auth', () => {
  it('signs in the demo user, notifies subscribers, and persists the session', async () => {
    const { be, store } = make();
    const seen: (string | null)[] = [];
    const off = be.auth.subscribe((id) => seen.push(id));
    await signIn(be);
    await be.auth.signOut();
    off();
    expect(seen).toEqual([null, 'mock-user-demo', null]);

    await signIn(be);
    const second: (string | null)[] = [];
    createMockBackend({ store, now: () => NOW }).auth.subscribe((id) => second.push(id));
    expect(second).toEqual(['mock-user-demo']);
  });

  it('rejects bad credentials and duplicate sign-ups', async () => {
    const { be } = make();
    await expect(be.auth.signInWithPassword(DEMO_USER.email, 'nope')).rejects.toThrow('Invalid login credentials');
    await expect(be.auth.signUp(DEMO_USER.email, 'whatever1')).rejects.toThrow('already registered');
    expect(await be.auth.signUp('New@Example.com', 'secret1')).toEqual({ needsConfirmation: false });
    await be.auth.signOut();
    await expect(be.auth.signInWithPassword('new@example.com', 'secret1')).resolves.toBeUndefined();
  });
});

describe('mock auth: acceptAnyCredentials (demo deployments)', () => {
  const demo = () => {
    const store = new MemoryKeyValueStore();
    return createMockBackend({ store, now: () => NOW, jobs: generateMockJobs(NOW), acceptAnyCredentials: true });
  };

  it('signs in with any credentials, creating the account once and keeping its identity', async () => {
    const be = demo();
    const seen: (string | null)[] = [];
    be.auth.subscribe((id) => seen.push(id));
    await be.auth.signInWithPassword('Someone@Example.com', 'anything');
    await be.auth.signOut();
    await be.auth.signInWithPassword('someone@example.com', 'different');
    expect(seen[1]).toBeTruthy();
    expect(seen[3]).toBe(seen[1]);
  });

  it('is advertised through the sandbox info, and off by default', () => {
    expect(demo().sandbox?.acceptsAnyCredentials).toBe(true);
    expect(make().be.sandbox?.acceptsAnyCredentials).toBe(false);
  });
});

describe('mock saved searches', () => {
  it('creates, lists (newest first, per user), renames and removes', async () => {
    let t = 0;
    const store = new MemoryKeyValueStore();
    const be = createMockBackend({ store, now: () => new Date(NOW.getTime() + ++t * 1000) });
    const a = await be.savedSearches.create('u1', 'A', f({ q: 'go' }));
    const b = await be.savedSearches.create('u1', 'B', EMPTY_FILTERS);
    await be.savedSearches.create('u2', 'other', EMPTY_FILTERS);

    expect((await be.savedSearches.list('u1')).map((s) => s.name)).toEqual(['B', 'A']);
    const renamed = await be.savedSearches.rename(a.id, 'A2');
    expect(renamed.name).toBe('A2');
    expect((await be.savedSearches.list('u1')).map((s) => s.name)).toEqual(['A2', 'B']);
    await be.savedSearches.remove(b.id);
    expect((await be.savedSearches.list('u1')).map((s) => s.name)).toEqual(['A2']);
    await expect(be.savedSearches.rename('missing', 'x')).rejects.toThrow('not found');
  });
});

describe('mock job lookup', () => {
  it('returns job + sources, null for unknown ids', async () => {
    const { be } = make();
    const [first] = await be.jobs.search(EMPTY_FILTERS, { limit: 1 });
    const job = await be.jobs.getJob(first!.jobId);
    expect(job?.title).toBe(first!.title);
    expect(job).not.toHaveProperty('sources');
    expect((await be.jobs.getSources(first!.jobId)).length).toBe(first!.sourceCount);
    expect(await be.jobs.getJob('nope')).toBeNull();
    expect(await be.jobs.getSources('nope')).toEqual([]);
  });
});
