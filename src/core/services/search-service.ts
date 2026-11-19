// Port of the desktop SearchService: cached standard search + AI search with silent fallback.

import type { SearchCache } from '../cache';
import type { AiSearchResult, SearchFilters, SearchHit } from '../models';
import type { JobsPort } from '../ports';
import { filtersKey } from '../search-params';

export interface SearchOptions {
  limit?: number;
  offset?: number;
  useCache?: boolean;
}

export interface AiSearchServiceOptions {
  limit?: number;
  useQueryPlanner?: boolean;
}

/** AI results below this count are considered "no strong matches" (desktop parity). */
export const AI_MIN_HITS = 3;

export class SearchService {
  constructor(
    private readonly jobs: JobsPort,
    private readonly cache: SearchCache,
  ) {}

  async search(filters: SearchFilters, opts: SearchOptions = {}): Promise<SearchHit[]> {
    const { limit = 50, offset = 0, useCache = true } = opts;
    const key = filtersKey(filters, limit, offset);
    if (useCache) {
      const cached = this.cache.read(key);
      if (cached) return cached;
    }
    const hits = await this.jobs.search(filters, { limit, offset });
    this.cache.write(key, hits);
    return hits;
  }

  /**
   * Falls back to the standard search when the AI path returns nothing useful: embeddings can be
   * silent on rare queries and an empty page is worse than keyword matches. AI results are never
   * cached (they depend on the embedding model and planner output).
   */
  async aiSearch(
    filters: SearchFilters,
    opts: AiSearchServiceOptions = {},
  ): Promise<AiSearchResult> {
    const { limit = 20, useQueryPlanner = false } = opts;
    if (filters.q.trim() === '') {
      // AI search needs a query: degrade to standard search transparently.
      return { hits: await this.search(filters, { limit }), usedFallback: true };
    }
    const aiHits = await this.jobs.aiSearch(filters, { limit, useQueryPlanner });
    if (aiHits.length < AI_MIN_HITS) {
      return { hits: await this.search(filters, { limit }), usedFallback: true };
    }
    return { hits: aiHits, usedFallback: false };
  }

  clearCache(): void {
    this.cache.clear();
  }
}
