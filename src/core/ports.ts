// Ports: the only surface the UI and services know about. Adapters (supabase, mock, or any
// future REST/GraphQL backend) implement `Backend`. See docs/ARCHITECTURE.md.

import type { Job, JobSource, SavedSearch, SearchFilters, SearchHit } from './models';

export type Unsubscribe = () => void;

export interface SignUpResult {
  /** true when the backend requires e-mail confirmation before a session exists */
  needsConfirmation: boolean;
}

export interface AuthPort {
  /**
   * Calls `listener` with the current user id (null = signed out) as soon as it is known,
   * then on every change. Mirrors the desktop `userIdChanges()` stream.
   */
  subscribe(listener: (userId: string | null) => void): Unsubscribe;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
}

export interface PageOptions {
  limit?: number;
  offset?: number;
}

export interface AiSearchOptions {
  limit?: number;
  useQueryPlanner?: boolean;
}

export interface JobsPort {
  search(filters: SearchFilters, opts?: PageOptions): Promise<SearchHit[]>;
  /** Requires an authenticated user (the real Edge Function is verify-jwt). */
  aiSearch(filters: SearchFilters, opts?: AiSearchOptions): Promise<SearchHit[]>;
  getJob(id: string): Promise<Job | null>;
  getSources(jobId: string): Promise<JobSource[]>;
}

export interface SavedSearchPort {
  list(userId: string): Promise<SavedSearch[]>;
  create(userId: string, name: string, filters: SearchFilters): Promise<SavedSearch>;
  remove(id: string): Promise<void>;
  rename(id: string, name: string): Promise<SavedSearch>;
}

/** Present only on sandbox backends: lets the UI show demo credentials and a "Sandbox" badge. */
export interface SandboxInfo {
  demoEmail: string;
  demoPassword: string;
  /** true when any e-mail/password signs in */
  acceptsAnyCredentials: boolean;
}

export interface Backend {
  /** Stable identifier, also used to namespace local caches. */
  readonly id: string;
  readonly sandbox?: SandboxInfo;
  readonly auth: AuthPort;
  readonly jobs: JobsPort;
  readonly savedSearches: SavedSearchPort;
}

/** Minimal sync key-value store (localStorage-shaped) used for the search cache. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}
