// Sandbox stand-ins for the Postgres `search_jobs` RPC and the `ai-job-search` Edge Function.
// They reproduce the *contract* (filters, sort modes, result shape, 401 for anonymous AI search),
// not the real ranking - good enough to exercise every UI state without a backend.

import type { SearchFilters, SearchHit } from '../../core/models';
import type { MockJob } from './data';

const DAY_MS = 86_400_000;

const tokenize = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9#+.]+/).filter((t) => t.length > 0);

const postedOrSeen = (j: MockJob): number => Date.parse(j.postedAt ?? j.firstSeenAt);

const recency = (j: MockJob, now: number): number =>
  Math.exp(-Math.max(0, now - postedOrSeen(j)) / (14 * DAY_MS));

function haystack(j: MockJob): { title: string; company: string; body: string } {
  return {
    title: j.title.toLowerCase(),
    company: j.companyName.toLowerCase(),
    body: `${j.descriptionText} ${j.locationRaw ?? ''} ${j.tags.join(' ')}`.toLowerCase(),
  };
}

/** Same predicate as the SQL `where` clause of search_jobs (salary: coalesce(max, min, 0) >= x). */
export function matchesFilters(j: MockJob, f: SearchFilters): boolean {
  if (f.remoteTypes.length && !f.remoteTypes.includes(j.remoteType)) return false;
  if (f.remoteScopes.length && !f.remoteScopes.includes(j.remoteScope)) return false;
  if (f.employmentTypes.length && !f.employmentTypes.includes(j.employmentType)) return false;
  if (f.seniorities.length && !f.seniorities.includes(j.seniority)) return false;
  if (f.countryCodes.length && !j.countryCodes.some((c) => f.countryCodes.includes(c))) return false;
  if (f.salaryMin != null && (j.salaryMax ?? j.salaryMin ?? 0) < f.salaryMin) return false;
  if (f.postedAfter && postedOrSeen(j) < Date.parse(f.postedAfter)) return false;
  return true;
}

export function toHit(j: MockJob, rank: number): SearchHit {
  return {
    jobId: j.id,
    title: j.title,
    companyName: j.companyName,
    locationRaw: j.locationRaw,
    remoteType: j.remoteType,
    remoteScope: j.remoteScope,
    employmentType: j.employmentType,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency,
    postedAt: j.postedAt,
    firstSeenAt: j.firstSeenAt,
    lastSeenAt: j.lastSeenAt,
    rank,
    sourceCount: j.sources.length,
  };
}

export function mockSearch(
  jobs: readonly MockJob[],
  f: SearchFilters,
  limit: number,
  offset: number,
  now: number = Date.now(),
): SearchHit[] {
  const tokens = tokenize(f.q);
  const scored: { job: MockJob; rank: number }[] = [];

  for (const job of jobs) {
    if (!matchesFilters(job, f)) continue;
    let rank = recency(job, now);
    if (tokens.length > 0) {
      const h = haystack(job);
      let score = 0;
      let allMatch = true;
      for (const t of tokens) {
        const inTitle = h.title.includes(t);
        const inCompany = h.company.includes(t);
        const inBody = h.body.includes(t);
        if (!inTitle && !inCompany && !inBody) {
          allMatch = false;
          break;
        }
        score += (inTitle ? 3 : 0) + (inCompany ? 2 : 0) + (inBody ? 1 : 0);
      }
      if (!allMatch) continue; // AND semantics, like websearch_to_tsquery
      rank = score / (tokens.length * 6) + 0.2 * rank;
    }
    scored.push({ job, rank });
  }

  scored.sort((a, b) => {
    if (f.sort === 'recent') return postedOrSeen(b.job) - postedOrSeen(a.job);
    if (f.sort === 'salaryDesc') {
      const sa = a.job.salaryMax ?? a.job.salaryMin;
      const sb = b.job.salaryMax ?? b.job.salaryMin;
      if (sa == null && sb == null) return b.rank - a.rank;
      if (sa == null) return 1; // nulls last
      if (sb == null) return -1;
      return sb - sa;
    }
    return b.rank - a.rank;
  });

  return scored.slice(offset, offset + limit).map(({ job, rank }) => toHit(job, rank));
}

// --- AI search -------------------------------------------------------------------------------

const SYNONYMS: Record<string, string[]> = {
  golang: ['go'],
  js: ['javascript', 'typescript', 'node'],
  ts: ['typescript'],
  k8s: ['kubernetes'],
  ml: ['machine', 'pytorch', 'mlops'],
  wfh: ['remote'],
  backend: ['api', 'services'],
  frontend: ['react', 'css'],
  dotnet: ['csharp'],
  '.net': ['dotnet', 'csharp'],
  'c#': ['csharp'],
};

const STOP = new Set(['a', 'an', 'the', 'in', 'at', 'for', 'with', 'and', 'or', 'role', 'job', 'want', 'looking', 'to', 'of']);

const EUROPE = ['DE', 'NL', 'PT', 'PL', 'GB', 'FR', 'ES', 'IE'];

/** Mock of the Gemini query planner: pulls structured filters out of a natural-language query. */
export function mockPlan(query: string): { semantic: string; filters: Partial<SearchFilters> } {
  const lower = query.toLowerCase();
  const filters: Partial<SearchFilters> = {};
  const consumed = new Set<string>();

  for (const r of ['remote', 'hybrid', 'onsite']) {
    if (lower.includes(r)) {
      filters.remoteTypes = [r];
      consumed.add(r);
    }
  }
  for (const s of ['junior', 'senior', 'staff', 'principal', 'lead']) {
    if (lower.includes(s)) {
      filters.seniorities = [s];
      consumed.add(s);
    }
  }
  if (lower.includes('contract')) {
    filters.employmentTypes = ['contract'];
    consumed.add('contract');
  }
  if (lower.includes('europe')) {
    filters.countryCodes = EUROPE;
    consumed.add('europe');
  }
  const semantic = tokenize(query).filter((t) => !consumed.has(t)).join(' ');
  return { semantic: semantic || query, filters };
}

export function mockAiSearch(
  jobs: readonly MockJob[],
  f: SearchFilters,
  limit: number,
  usePlanner: boolean,
  now: number = Date.now(),
): SearchHit[] {
  let semantic = f.q;
  let effective = f;
  if (usePlanner) {
    const plan = mockPlan(f.q);
    semantic = plan.semantic;
    // Explicit UI filters win over planner output (same merge order as the Edge Function).
    const merged: SearchFilters = { ...f };
    if (!f.remoteTypes.length && plan.filters.remoteTypes) merged.remoteTypes = plan.filters.remoteTypes;
    if (!f.seniorities.length && plan.filters.seniorities) merged.seniorities = plan.filters.seniorities;
    if (!f.employmentTypes.length && plan.filters.employmentTypes) merged.employmentTypes = plan.filters.employmentTypes;
    if (!f.countryCodes.length && plan.filters.countryCodes) merged.countryCodes = plan.filters.countryCodes;
    effective = merged;
  }

  const terms = new Set<string>();
  for (const t of tokenize(semantic)) {
    if (STOP.has(t)) continue;
    terms.add(t);
    for (const s of SYNONYMS[t] ?? []) terms.add(s);
  }
  if (terms.size === 0) return [];

  const MIN_SIMILARITY = 0.25;
  const out: SearchHit[] = [];
  for (const job of jobs) {
    if (!matchesFilters(job, effective)) continue;
    const h = haystack(job);
    const text = `${h.title} ${h.company} ${h.body}`;
    let matched = 0;
    for (const t of terms) if (text.includes(t)) matched++;
    const sim = matched / terms.size;
    if (sim < MIN_SIMILARITY) continue;
    // Same blend as match_jobs_ai: similarity 0.75, quality 0.15, recency 0.10.
    const finalScore = sim * 0.75 + job.quality * 0.15 + recency(job, now) * 0.1;
    out.push(toHit(job, finalScore));
  }
  out.sort((a, b) => b.rank - a.rank);
  return out.slice(0, limit);
}
