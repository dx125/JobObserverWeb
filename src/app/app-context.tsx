// Dependency container for the UI (the web counterpart of the desktop service_locator.dart).
// Components get services from here and never import an adapter.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserKeyValueStore, SearchCache } from '../core/cache';
import type { Backend, KeyValueStore, SandboxInfo } from '../core/ports';
import { AuthService } from '../core/services/auth-service';
import { JobService } from '../core/services/job-service';
import { SavedSearchService } from '../core/services/saved-search-service';
import { SearchService } from '../core/services/search-service';

export interface AppServices {
  backendId: string;
  sandbox: SandboxInfo | undefined;
  auth: AuthService;
  search: SearchService;
  jobs: JobService;
  savedSearches: SavedSearchService;
  /** undefined = still resolving the session, null = signed out */
  userId: string | null | undefined;
}

const AppContext = createContext<AppServices | null>(null);

export function AppProvider(props: {
  backend: Backend;
  /** Cache storage; defaults to localStorage. Tests pass an in-memory store. */
  cacheStore?: KeyValueStore;
  children: ReactNode;
}) {
  const { backend, cacheStore, children } = props;

  const base = useMemo(() => {
    const cache = new SearchCache(cacheStore ?? new BrowserKeyValueStore(), {
      namespace: backend.id,
    });
    return {
      backendId: backend.id,
      sandbox: backend.sandbox,
      auth: new AuthService(backend.auth),
      search: new SearchService(backend.jobs, cache),
      jobs: new JobService(backend.jobs),
      savedSearches: new SavedSearchService(backend.savedSearches),
    };
  }, [backend, cacheStore]);

  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  useEffect(() => base.auth.subscribe(setUserId), [base]);

  const value = useMemo(() => ({ ...base, userId }), [base, userId]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
