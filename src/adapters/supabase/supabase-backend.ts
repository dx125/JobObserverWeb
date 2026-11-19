// Supabase implementation of the Backend port. Talks to the same project as the desktop app:
// `search_jobs` RPC, `jobs` / `job_sources` / `saved_searches` tables (RLS), `ai-job-search`
// Edge Function, GoTrue e-mail/password auth. See docs/BACKEND_CONTRACT.md.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Job, JobSource, SavedSearch, SearchFilters, SearchHit } from '../../core/models';
import type {
  AiSearchOptions,
  AuthPort,
  Backend,
  JobsPort,
  PageOptions,
  SavedSearchPort,
  SignUpResult,
  Unsubscribe,
} from '../../core/ports';
import {
  aiHitFromRow,
  aiSearchBody,
  filtersToQueryJson,
  hitFromRow,
  jobFromRow,
  savedSearchFromRow,
  searchRpcParams,
  sourceFromRow,
} from './mappers';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

type Row = Record<string, unknown>;

class SupabaseAuth implements AuthPort {
  constructor(private readonly client: SupabaseClient) {}

  subscribe(listener: (userId: string | null) => void): Unsubscribe {
    // supabase-js emits INITIAL_SESSION right after subscribing, so the listener always fires.
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(session?.user.id ?? null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return { needsConfirmation: data.session == null };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }
}

class SupabaseJobs implements JobsPort {
  constructor(private readonly client: SupabaseClient) {}

  async search(filters: SearchFilters, opts: PageOptions = {}): Promise<SearchHit[]> {
    const { limit = 50, offset = 0 } = opts;
    const { data, error } = await this.client.rpc('search_jobs', searchRpcParams(filters, limit, offset));
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => hitFromRow(r));
  }

  async aiSearch(filters: SearchFilters, opts: AiSearchOptions = {}): Promise<SearchHit[]> {
    const { limit = 20, useQueryPlanner = false } = opts;
    const { data, error } = await this.client.functions.invoke('ai-job-search', {
      body: aiSearchBody(filters, limit, useQueryPlanner),
    });
    if (error) throw new Error(await describeFunctionError(error));
    const results = ((data as { results?: Row[] } | null)?.results ?? []) as Row[];
    return results.map((r) => aiHitFromRow(r));
  }

  async getJob(id: string): Promise<Job | null> {
    const { data, error } = await this.client.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? jobFromRow(data as Row) : null;
  }

  async getSources(jobId: string): Promise<JobSource[]> {
    const { data, error } = await this.client
      .from('job_sources')
      .select('*')
      .eq('job_id', jobId)
      .order('last_seen_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => sourceFromRow(r));
  }
}

class SupabaseSavedSearches implements SavedSearchPort {
  constructor(private readonly client: SupabaseClient) {}

  async list(userId: string): Promise<SavedSearch[]> {
    const { data, error } = await this.client
      .from('saved_searches')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((r) => savedSearchFromRow(r));
  }

  async create(userId: string, name: string, filters: SearchFilters): Promise<SavedSearch> {
    const { data, error } = await this.client
      .from('saved_searches')
      .insert({ user_id: userId, name, query_json: filtersToQueryJson(filters) })
      .select()
      .single();
    if (error) throw error;
    return savedSearchFromRow(data as Row);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from('saved_searches').delete().eq('id', id);
    if (error) throw error;
  }

  async rename(id: string, name: string): Promise<SavedSearch> {
    const { data, error } = await this.client
      .from('saved_searches')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return savedSearchFromRow(data as Row);
  }
}

/** FunctionsHttpError carries the Response in `context`; surface the server's message. */
async function describeFunctionError(error: unknown): Promise<string> {
  const e = error as { message?: string; context?: Response };
  if (e.context && typeof e.context.text === 'function') {
    try {
      const body = await e.context.text();
      return `ai-job-search failed (${e.context.status}): ${body}`;
    } catch {
      // fall through to the generic message
    }
  }
  return `ai-job-search failed: ${e.message ?? 'unknown error'}`;
}

/** Wraps an existing client (tests inject a fake). */
export function createSupabaseBackendFromClient(client: SupabaseClient): Backend {
  return {
    id: 'supabase',
    auth: new SupabaseAuth(client),
    jobs: new SupabaseJobs(client),
    savedSearches: new SupabaseSavedSearches(client),
  };
}

export function createSupabaseBackend(config: SupabaseConfig): Backend {
  return createSupabaseBackendFromClient(createClient(config.url, config.anonKey));
}
