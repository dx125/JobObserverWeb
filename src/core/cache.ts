// TTL cache for standard-search results. Replaces the desktop SQLite `search_cache` table
// (30 min TTL). Namespaced per backend so mock and real results never mix in one origin.

import type { SearchHit } from './models';
import type { KeyValueStore } from './ports';

interface Entry {
  createdAt: number;
  hits: SearchHit[];
}

export interface SearchCacheOptions {
  namespace: string;
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class SearchCache {
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly store: KeyValueStore,
    opts: SearchCacheOptions,
  ) {
    this.prefix = `jo:${opts.namespace}:search:`;
    this.ttlMs = opts.ttlMs ?? 30 * 60 * 1000;
    this.maxEntries = opts.maxEntries ?? 50;
    this.now = opts.now ?? Date.now;
  }

  read(key: string): SearchHit[] | null {
    const raw = this.store.get(this.prefix + key);
    if (raw == null) return null;
    try {
      const entry = JSON.parse(raw) as Entry;
      if (this.now() - entry.createdAt > this.ttlMs) {
        this.store.remove(this.prefix + key);
        return null;
      }
      return entry.hits;
    } catch {
      this.store.remove(this.prefix + key);
      return null;
    }
  }

  write(key: string, hits: SearchHit[]): void {
    const entry: Entry = { createdAt: this.now(), hits };
    try {
      this.store.set(this.prefix + key, JSON.stringify(entry));
    } catch {
      // Quota exceeded or storage unavailable: caching is best-effort.
      return;
    }
    this.prune();
  }

  clear(): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(this.prefix)) this.store.remove(k);
    }
  }

  private prune(): void {
    const mine = this.store.keys().filter((k) => k.startsWith(this.prefix));
    if (mine.length <= this.maxEntries) return;
    const aged = mine.map((k) => {
      try {
        return { k, t: (JSON.parse(this.store.get(k) ?? '{}') as Entry).createdAt ?? 0 };
      } catch {
        return { k, t: 0 };
      }
    });
    aged.sort((a, b) => a.t - b.t);
    for (const { k } of aged.slice(0, mine.length - this.maxEntries)) this.store.remove(k);
  }
}

/** localStorage-backed store; every call is guarded because storage can be blocked. */
export class BrowserKeyValueStore implements KeyValueStore {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  set(key: string, value: string): void {
    localStorage.setItem(key, value);
  }
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  keys(): string[] {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}
