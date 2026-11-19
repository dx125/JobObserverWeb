// URL <-> search state codec. The desktop keeps filters in a global Riverpod provider so they
// survive a trip to the detail page; on the web the URL is the state (back button, shareable
// links, reload-safe). See docs/DECISIONS.md ADR-005.

import { EMPTY_FILTERS, SEARCH_SORTS, type SearchFilters, type SearchSort } from './models';

/** Search-page state that is not part of SearchFilters (UI-only toggles). */
export interface SearchMode {
  ai: boolean;
  planner: boolean;
}

export const DEFAULT_MODE: SearchMode = { ai: false, planner: false };

const csv = (v: string | null): string[] => (v ? v.split(',').filter(Boolean) : []);

export function paramsToState(p: URLSearchParams): { filters: SearchFilters; mode: SearchMode } {
  const sort = p.get('sort');
  const sal = Number(p.get('sal'));
  const ai = p.get('ai') === '1';
  return {
    filters: {
      q: p.get('q') ?? '',
      remoteTypes: csv(p.get('remote')),
      remoteScopes: csv(p.get('scope')),
      employmentTypes: csv(p.get('emp')),
      seniorities: csv(p.get('sen')),
      countryCodes: csv(p.get('cc')),
      salaryMin: p.get('sal') && Number.isFinite(sal) && sal > 0 ? sal : null,
      postedAfter: p.get('after') || null,
      sort: SEARCH_SORTS.includes(sort as SearchSort) ? (sort as SearchSort) : 'relevance',
    },
    mode: { ai, planner: ai && p.get('planner') === '1' },
  };
}

export function stateToParams(filters: SearchFilters, mode: SearchMode): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.remoteTypes.length) p.set('remote', filters.remoteTypes.join(','));
  if (filters.remoteScopes.length) p.set('scope', filters.remoteScopes.join(','));
  if (filters.employmentTypes.length) p.set('emp', filters.employmentTypes.join(','));
  if (filters.seniorities.length) p.set('sen', filters.seniorities.join(','));
  if (filters.countryCodes.length) p.set('cc', filters.countryCodes.join(','));
  if (filters.salaryMin != null && filters.salaryMin > 0) p.set('sal', String(filters.salaryMin));
  if (filters.postedAfter) p.set('after', filters.postedAfter);
  if (filters.sort !== EMPTY_FILTERS.sort) p.set('sort', filters.sort);
  if (mode.ai) p.set('ai', '1');
  if (mode.ai && mode.planner) p.set('planner', '1');
  return p;
}

/** Stable key for a filter set (cache key, React effect dependency). */
export function filtersKey(filters: SearchFilters, limit: number, offset: number): string {
  return JSON.stringify({ filters, limit, offset });
}
