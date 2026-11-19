// In-browser sandbox implementation of the Backend port: no network, no secrets.
// Auth users, the session and saved searches persist in the injected KeyValueStore so a page
// reload behaves like the real thing. Passwords are stored in clear text: this is a sandbox.
// See docs/MOCK_BACKEND.md.

import type { Job, JobSource, SavedSearch, SearchFilters, SearchHit } from '../../core/models';
import type {
  AiSearchOptions,
  AuthPort,
  Backend,
  JobsPort,
  KeyValueStore,
  PageOptions,
  SavedSearchPort,
  SignUpResult,
  Unsubscribe,
} from '../../core/ports';
import { generateMockJobs, type MockJob } from './data';
import { mockAiSearch, mockSearch } from './search';

export const DEMO_USER = { email: 'demo@example.com', password: 'demo1234' } as const;

export interface MockBackendOptions {
  store: KeyValueStore;
  /** Artificial latency per call, to make loading states visible. Default 0. */
  latencyMs?: number;
  /**
   * Any e-mail/password signs in (the account is created on first use, the password is ignored).
   * Opt-in for demo deployments; off by default so the sandbox still behaves like a real login.
   */
  acceptAnyCredentials?: boolean;
  /** Clock override for deterministic tests. */
  now?: () => Date;
  /** Seed data override. */
  jobs?: MockJob[];
}

interface StoredUser {
  id: string;
  email: string;
  password: string;
}

interface StoredSaved extends SavedSearch {
  userId: string;
}

const K_USERS = 'jo:mock:users';
const K_SESSION = 'jo:mock:session';
const K_SAVED = 'jo:mock:saved';

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createMockBackend(opts: MockBackendOptions): Backend {
  const { store } = opts;
  const latency = opts.latencyMs ?? 0;
  const clock = opts.now ?? (() => new Date());
  const jobs = opts.jobs ?? generateMockJobs(clock());

  const wait = (): Promise<void> =>
    latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve();

  const readJson = <T,>(key: string, fallback: T): T => {
    const raw = store.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  // Seed the demo account once.
  const users = readJson<StoredUser[]>(K_USERS, []);
  if (!users.some((u) => u.email === DEMO_USER.email)) {
    users.push({ id: 'mock-user-demo', ...DEMO_USER });
    store.set(K_USERS, JSON.stringify(users));
  }

  const listeners = new Set<(id: string | null) => void>();
  const currentUserId = (): string | null => store.get(K_SESSION);
  const setSession = (id: string | null): void => {
    if (id) store.set(K_SESSION, id);
    else store.remove(K_SESSION);
    for (const l of listeners) l(id);
  };

  const auth: AuthPort = {
    subscribe(listener): Unsubscribe {
      listeners.add(listener);
      listener(currentUserId());
      return () => listeners.delete(listener);
    },
    async signInWithPassword(email, password) {
      await wait();
      const all = readJson<StoredUser[]>(K_USERS, []);
      const e = email.toLowerCase();
      if (opts.acceptAnyCredentials) {
        let known = all.find((u) => u.email === e);
        if (!known) {
          known = { id: newId('mock-user'), email: e, password };
          store.set(K_USERS, JSON.stringify([...all, known]));
        }
        setSession(known.id);
        return;
      }
      const user = all.find((u) => u.email === e && u.password === password);
      if (!user) throw new Error('Invalid login credentials');
      setSession(user.id);
    },
    async signUp(email, password): Promise<SignUpResult> {
      await wait();
      const all = readJson<StoredUser[]>(K_USERS, []);
      const e = email.toLowerCase();
      if (all.some((u) => u.email === e)) throw new Error('User already registered');
      const user: StoredUser = { id: newId('mock-user'), email: e, password };
      store.set(K_USERS, JSON.stringify([...all, user]));
      setSession(user.id); // sandbox: no e-mail confirmation step
      return { needsConfirmation: false };
    },
    async signOut() {
      await wait();
      setSession(null);
    },
  };

  const jobsPort: JobsPort = {
    async search(filters: SearchFilters, o: PageOptions = {}): Promise<SearchHit[]> {
      await wait();
      return mockSearch(jobs, filters, o.limit ?? 50, o.offset ?? 0, clock().getTime());
    },
    async aiSearch(filters: SearchFilters, o: AiSearchOptions = {}): Promise<SearchHit[]> {
      await wait();
      // The real Edge Function is deployed with --verify-jwt.
      if (!currentUserId()) throw new Error('ai-job-search failed (401): {"msg":"Invalid JWT"}');
      return mockAiSearch(jobs, filters, o.limit ?? 20, o.useQueryPlanner ?? false, clock().getTime());
    },
    async getJob(id: string): Promise<Job | null> {
      await wait();
      const j = jobs.find((x) => x.id === id);
      if (!j) return null;
      const { sources: _s, quality: _q, tags: _t, ...job } = j;
      return job;
    },
    async getSources(jobId: string): Promise<JobSource[]> {
      await wait();
      const j = jobs.find((x) => x.id === jobId);
      return j ? [...j.sources].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)) : [];
    },
  };

  const readSaved = (): StoredSaved[] => readJson<StoredSaved[]>(K_SAVED, []);
  const writeSaved = (all: StoredSaved[]): void => store.set(K_SAVED, JSON.stringify(all));
  const strip = ({ userId: _u, ...rest }: StoredSaved): SavedSearch => rest;

  const savedSearches: SavedSearchPort = {
    async list(userId) {
      await wait();
      return readSaved()
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(strip);
    },
    async create(userId, name, filters) {
      await wait();
      const ts = clock().toISOString();
      const row: StoredSaved = { id: newId('mock-saved'), userId, name, filters, createdAt: ts, updatedAt: ts };
      writeSaved([...readSaved(), row]);
      return strip(row);
    },
    async remove(id) {
      await wait();
      writeSaved(readSaved().filter((s) => s.id !== id));
    },
    async rename(id, name) {
      await wait();
      const all = readSaved();
      const row = all.find((s) => s.id === id);
      if (!row) throw new Error('Saved search not found');
      row.name = name;
      row.updatedAt = clock().toISOString();
      writeSaved(all);
      return strip(row);
    },
  };

  return {
    id: 'mock',
    sandbox: {
      demoEmail: DEMO_USER.email,
      demoPassword: DEMO_USER.password,
      acceptsAnyCredentials: opts.acceptAnyCredentials === true,
    },
    auth,
    jobs: jobsPort,
    savedSearches,
  };
}
