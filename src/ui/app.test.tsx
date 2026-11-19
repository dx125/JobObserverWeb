import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { AppProvider } from '../app/app-context';
import { createMockBackend, DEMO_USER } from '../adapters/mock/mock-backend';
import { SANITIZATION_FIXTURE_ID, generateMockJobs } from '../adapters/mock/data';
import { MemoryKeyValueStore } from '../core/cache';

const NOW = new Date();

function setup(initialPath = '/search', store = new MemoryKeyValueStore()) {
  const backend = createMockBackend({ store, jobs: generateMockJobs(NOW), now: () => NOW });
  const view = render(
    <AppProvider backend={backend} cacheStore={new MemoryKeyValueStore()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProvider>,
  );
  return { backend, store, ...view };
}

/** A store that already holds a demo-user session (what a reload after sign-in looks like). */
function signedInStore(): MemoryKeyValueStore {
  const store = new MemoryKeyValueStore();
  store.set('jo:mock:session', 'mock-user-demo');
  return store;
}

async function signInAsDemo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), DEMO_USER.email);
  await user.type(screen.getByLabelText('Password'), DEMO_USER.password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('auth guard', () => {
  it('redirects signed-out users to /login and into the app after sign-in', async () => {
    const user = userEvent.setup();
    setup('/search');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/Sandbox mode/)).toBeInTheDocument();
    await signInAsDemo(user);
    expect(await screen.findByRole('search')).toBeInTheDocument();
  });

  it('shows a readable error for bad credentials', async () => {
    const user = userEvent.setup();
    setup('/login');
    await user.type(await screen.findByLabelText('Email'), DEMO_USER.email);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('keeps the user signed in across reloads (session persisted)', async () => {
    const user = userEvent.setup();
    const first = setup('/login');
    await signInAsDemo(user);
    await screen.findByRole('search');
    first.unmount();
    setup('/search', first.store);
    expect(await screen.findByRole('search')).toBeInTheDocument();
  });
});

describe('search flow', () => {
  it('lists results, filters them and shows an empty state', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);

    const results = await screen.findByRole('region', { name: 'Results' });
    await waitFor(() => expect(within(results).getAllByRole('link').length).toBeGreaterThan(10));

    await user.click(screen.getByRole('button', { name: 'Hybrid' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hybrid' })).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => {
      const cards = within(screen.getByRole('region', { name: 'Results' })).getAllByRole('link');
      cards.forEach((c) => expect(within(c).queryByText('Remote')).toBeNull());
    });

    await user.type(screen.getByLabelText('Search jobs'), 'zzzznotaword{enter}');
    expect(await screen.findByText('No results')).toBeInTheDocument();
  });

  it('AI search toggle exposes the planner option', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    await screen.findByRole('search');
    expect(screen.queryByLabelText(/Use query planner/)).toBeNull();
    await user.click(screen.getByLabelText(/AI search/));
    expect(screen.getByLabelText(/Use query planner/)).toBeInTheDocument();
  });

  it('AI search discloses the fallback to standard results', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    await screen.findByRole('search');
    await user.click(screen.getByLabelText(/AI search/));
    // "fixture" matches exactly one job: AI returns 1 (< 3) hit, so the service falls back to
    // standard search (also 1 hit) and the UI must say so.
    await user.type(screen.getByLabelText('Search jobs'), 'fixture{enter}');
    expect(await screen.findByText(/AI search returned no strong matches/)).toBeInTheDocument();
    expect(screen.getByText('Sandbox Sanitization Fixture')).toBeInTheDocument();
  });

  it('AI search with plenty of matches shows no fallback banner', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    await screen.findByRole('search');
    await user.click(screen.getByLabelText(/AI search/));
    await user.type(screen.getByLabelText('Search jobs'), 'react typescript{enter}');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /ago|just now/ }).length).toBeGreaterThanOrEqual(3));
    expect(screen.queryByText(/AI search returned no strong matches/)).toBeNull();
  });

  it('saves the current search and lists it on the Saved page, where it can be deleted', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    await screen.findByRole('search');

    await user.type(screen.getByLabelText('Search jobs'), 'react{enter}');
    await user.click(screen.getByRole('button', { name: 'Save search' }));
    await user.type(screen.getByLabelText('Search name'), 'My React search');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved "My React search"')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Saved' }));
    expect(await screen.findByText('My React search')).toBeInTheDocument();
    expect(screen.getByText('"react"')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete My React search' }));
    expect(await screen.findByText('No saved searches yet')).toBeInTheDocument();
  });

  it('settings: clears cache and signs out back to the login page', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    await user.click(await screen.findByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Clear local search cache' }));
    expect(screen.getByText('Cache cleared')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('job detail', () => {
  it('renders job, sources and a back link for deep links', async () => {
    const user = userEvent.setup();
    setup('/login');
    await signInAsDemo(user);
    const card = (await screen.findAllByRole('link', { name: /sources|ago|just now/ }))[0]!;
    await user.click(card);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to results/ })).toBeInTheDocument();
  });

  it('shows Not found for unknown ids', async () => {
    setup('/jobs/does-not-exist', signedInStore());
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  it('neutralizes hostile scraped content (XSS fixture)', async () => {
    setup(`/jobs/${SANITIZATION_FIXTURE_ID}`, signedInStore());
    expect(await screen.findByText('Safe paragraph.')).toBeInTheDocument();

    const win = window as unknown as { __xss?: boolean };
    expect(win.__xss).toBeUndefined();
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('[onerror]')).toBeNull();
    // javascript: links never become anchors (View original / source Open) ...
    expect(screen.queryByRole('link', { name: 'View original' })).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    // ... while safe links survive and are hardened.
    const good = screen.getByRole('link', { name: 'good link' });
    expect(good).toHaveAttribute('rel', 'noopener noreferrer');
    expect(good).toHaveAttribute('target', '_blank');
  });
});
