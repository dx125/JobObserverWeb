// Wire <-> domain mapping for the existing JobObserver Supabase backend.
// Every field name here is the contract shared with the desktop app; see docs/BACKEND_CONTRACT.md.
// Pure functions: unit-tested without a network.

import {
  SEARCH_SORTS,
  type Job,
  type JobSource,
  type SavedSearch,
  type SearchFilters,
  type SearchHit,
  type SearchSort,
} from '../../core/models';

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const intOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** ISO string for a timestamptz column, or `fallback` when missing/unparseable. */
function iso(v: unknown, fallback: string | null): string | null {
  if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) return v;
  return fallback;
}

export function hitFromRow(m: Row, now: string = new Date().toISOString()): SearchHit {
  return {
    jobId: str(m.job_id),
    title: str(m.title),
    companyName: str(m.company_name),
    locationRaw: strOrNull(m.location_raw),
    remoteType: str(m.remote_type, 'unknown'),
    remoteScope: str(m.remote_scope, 'unknown'),
    employmentType: str(m.employment_type, 'unknown'),
    salaryMin: intOrNull(m.salary_min),
    salaryMax: intOrNull(m.salary_max),
    salaryCurrency: strOrNull(m.salary_currency),
    postedAt: iso(m.posted_at, null),
    firstSeenAt: iso(m.first_seen_at, now) as string,
    lastSeenAt: iso(m.last_seen_at, now) as string,
    rank: typeof m.rank === 'number' ? m.rank : 0,
    sourceCount: intOrNull(m.source_count) ?? 1,
  };
}

/**
 * `match_jobs_ai` shape: `final_score` instead of `rank`, no first/last_seen_at, no source_count.
 * Defaults are synthesized so AI hits render with the same card as standard hits.
 */
export function aiHitFromRow(m: Row, now: string = new Date().toISOString()): SearchHit {
  return {
    ...hitFromRow(m, now),
    firstSeenAt: now,
    lastSeenAt: now,
    rank: typeof m.final_score === 'number' ? m.final_score : 0,
    sourceCount: 1,
  };
}

export function jobFromRow(m: Row, now: string = new Date().toISOString()): Job {
  return {
    id: str(m.id),
    title: str(m.title),
    companyName: str(m.company_name),
    locationRaw: strOrNull(m.location_raw),
    remoteType: str(m.remote_type, 'unknown'),
    remoteScope: str(m.remote_scope, 'unknown'),
    employmentType: str(m.employment_type, 'unknown'),
    seniority: str(m.seniority, 'unknown'),
    salaryMin: intOrNull(m.salary_min),
    salaryMax: intOrNull(m.salary_max),
    salaryCurrency: strOrNull(m.salary_currency),
    descriptionHtml: strOrNull(m.description_html),
    descriptionText: str(m.description_text),
    postedAt: iso(m.posted_at, null),
    firstSeenAt: iso(m.first_seen_at, now) as string,
    lastSeenAt: iso(m.last_seen_at, now) as string,
    canonicalUrl: strOrNull(m.canonical_url),
    countryCodes: strArray(m.location_country_codes),
  };
}

export function sourceFromRow(m: Row, now: string = new Date().toISOString()): JobSource {
  return {
    id: str(m.id),
    connectorId: str(m.connector_id),
    instanceKey: str(m.instance_key),
    sourceUrl: str(m.source_url),
    sourceType: str(m.source_type),
    lastSeenAt: iso(m.last_seen_at, now) as string,
  };
}

/** `saved_searches.query_json` - same keys the desktop `SearchFilters.toJson()` writes. */
export function filtersToQueryJson(f: SearchFilters): Row {
  return {
    q: f.q,
    remote_types: f.remoteTypes,
    remote_scopes: f.remoteScopes,
    employment_types: f.employmentTypes,
    seniorities: f.seniorities,
    country_codes: f.countryCodes,
    salary_min: f.salaryMin,
    posted_after: f.postedAfter,
    // The desktop writes the Dart enum name (`relevance` | `recent` | `salaryDesc`), same as ours.
    sort: f.sort,
  };
}

export function filtersFromQueryJson(q: Row): SearchFilters {
  const sort = q.sort;
  return {
    q: str(q.q),
    remoteTypes: strArray(q.remote_types),
    remoteScopes: strArray(q.remote_scopes),
    employmentTypes: strArray(q.employment_types),
    seniorities: strArray(q.seniorities),
    countryCodes: strArray(q.country_codes),
    salaryMin: intOrNull(q.salary_min),
    postedAfter: typeof q.posted_after === 'string' ? q.posted_after : null,
    sort: SEARCH_SORTS.includes(sort as SearchSort) ? (sort as SearchSort) : 'relevance',
  };
}

export function savedSearchFromRow(m: Row, now: string = new Date().toISOString()): SavedSearch {
  const query = m.query_json && typeof m.query_json === 'object' ? (m.query_json as Row) : {};
  return {
    id: str(m.id),
    name: str(m.name, 'Untitled'),
    filters: filtersFromQueryJson(query),
    createdAt: iso(m.created_at, now) as string,
    updatedAt: iso(m.updated_at, now) as string,
  };
}

const nullIfEmpty = (v: string[]): string[] | null => (v.length === 0 ? null : v);

const SORT_MODE: Record<SearchSort, string> = {
  relevance: 'relevance',
  recent: 'recent',
  salaryDesc: 'salary_desc',
};

/** Named arguments of the `search_jobs` RPC (latest signature: 20260505120003_fix_rank_weights). */
export function searchRpcParams(f: SearchFilters, limit: number, offset: number): Row {
  return {
    q: f.q === '' ? null : f.q,
    remote_types: nullIfEmpty(f.remoteTypes),
    remote_scopes: nullIfEmpty(f.remoteScopes),
    employment_types: nullIfEmpty(f.employmentTypes),
    seniorities: nullIfEmpty(f.seniorities),
    country_codes: nullIfEmpty(f.countryCodes),
    salary_min_filter: f.salaryMin,
    salary_max_filter: null,
    posted_after: f.postedAfter,
    sort_mode: SORT_MODE[f.sort],
    result_limit: limit,
    result_offset: offset,
  };
}

/**
 * Body of the `ai-job-search` Edge Function. The function accepts one value per dimension, so
 * multi-select filters are collapsed: exactly one selection is sent, several are omitted so the
 * planner / no-filter semantics broaden the pool (same rule as the desktop JobDal.aiSearch).
 */
export function aiSearchBody(f: SearchFilters, limit: number, useQueryPlanner: boolean): Row {
  const filters: Row = {};
  if (f.remoteTypes.length === 1) filters.remote_type = f.remoteTypes[0];
  if (f.remoteScopes.length === 1) filters.remote_scope = f.remoteScopes[0];
  if (f.employmentTypes.length === 1) filters.employment_type = f.employmentTypes[0];
  if (f.seniorities.length === 1) filters.seniority = f.seniorities[0];
  if (f.countryCodes.length > 0) filters.country_codes = f.countryCodes;
  if (f.salaryMin != null) filters.salary_min_required = f.salaryMin;
  if (f.postedAfter) filters.posted_after = f.postedAfter;
  return {
    query: f.q,
    limit,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
    use_query_planner: useQueryPlanner,
  };
}
