// Domain models. Backend-agnostic: no snake_case, no Supabase types.
// Dates are ISO-8601 strings so every model is JSON-serializable (cache, URL, mock storage).
// Mirrors the desktop app's lib/models/* (see docs/FEATURE_PARITY.md).

export type SearchSort = 'relevance' | 'recent' | 'salaryDesc';

/** Values offered by the filter UI (same lists as the desktop FiltersPanel). */
export const REMOTE_TYPE_OPTIONS = ['remote', 'hybrid', 'onsite'] as const;
export const EMPLOYMENT_TYPE_OPTIONS = ['full_time', 'part_time', 'contract', 'internship'] as const;
export const SENIORITY_OPTIONS = ['junior', 'mid', 'senior', 'staff', 'principal', 'lead'] as const;
export const SEARCH_SORTS: readonly SearchSort[] = ['relevance', 'recent', 'salaryDesc'];

export interface SearchFilters {
  q: string;
  remoteTypes: string[];
  remoteScopes: string[];
  employmentTypes: string[];
  seniorities: string[];
  countryCodes: string[];
  salaryMin: number | null;
  postedAfter: string | null;
  sort: SearchSort;
}

export const EMPTY_FILTERS: SearchFilters = Object.freeze({
  q: '',
  remoteTypes: [],
  remoteScopes: [],
  employmentTypes: [],
  seniorities: [],
  countryCodes: [],
  salaryMin: null,
  postedAfter: null,
  sort: 'relevance',
}) as SearchFilters;

/** A row in a result list. Same shape for standard and AI search. */
export interface SearchHit {
  jobId: string;
  title: string;
  companyName: string;
  locationRaw: string | null;
  remoteType: string;
  remoteScope: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** relevance rank (standard search) or final_score (AI search) */
  rank: number;
  sourceCount: number;
}

export interface Job {
  id: string;
  title: string;
  companyName: string;
  locationRaw: string | null;
  remoteType: string;
  remoteScope: string;
  employmentType: string;
  seniority: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  descriptionHtml: string | null;
  descriptionText: string;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  canonicalUrl: string | null;
  countryCodes: string[];
}

export interface JobSource {
  id: string;
  connectorId: string;
  instanceKey: string;
  sourceUrl: string;
  sourceType: string;
  lastSeenAt: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
}

/** Result of an AI search through the service layer. */
export interface AiSearchResult {
  hits: SearchHit[];
  /** true when AI returned too little and the service fell back to standard search */
  usedFallback: boolean;
}
