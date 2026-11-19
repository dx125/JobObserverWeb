import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../app/app-context';
import { useAsync } from '../../app/use-async';
import type { SearchFilters } from '../../core/models';
import { paramsToState, stateToParams, type SearchMode } from '../../core/search-params';
import { FiltersPanel } from '../components/FiltersPanel';
import { JobCard } from '../components/JobCard';
import { NamePromptDialog } from '../components/NamePromptDialog';

function SearchBar(props: {
  q: string;
  mode: SearchMode;
  onSubmit: (q: string) => void;
  onMode: (m: SearchMode) => void;
  onSave: () => void;
}) {
  const [text, setText] = useState(props.q);
  useEffect(() => setText(props.q), [props.q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit(text.trim());
  };

  return (
    <div className="searchbar">
      <form className="searchbar__row" onSubmit={submit} role="search">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          aria-label="Search jobs"
          placeholder={
            props.mode.ai
              ? 'Describe what you want (e.g. "remote senior Go role in Europe")'
              : 'Search jobs (e.g. "senior backend remote")'
          }
        />
        <button type="submit" className="btn btn--primary">
          Search
        </button>
        <button type="button" className="btn" onClick={props.onSave} title="Save current search">
          Save search
        </button>
      </form>
      <div className="searchbar__opts">
        <label title="Semantic search powered by embeddings. Falls back to standard search when there are no strong matches.">
          <input
            type="checkbox"
            checked={props.mode.ai}
            onChange={(e) => props.onMode({ ai: e.currentTarget.checked, planner: false })}
          />{' '}
          AI search (beta)
        </label>
        {props.mode.ai && (
          <label title="Let the LLM extract structured filters (remote, country, seniority) from your query.">
            <input
              type="checkbox"
              checked={props.mode.planner}
              onChange={(e) => props.onMode({ ai: true, planner: e.currentTarget.checked })}
            />{' '}
            Use query planner
          </label>
        )}
      </div>
    </div>
  );
}

export function SearchPage() {
  const app = useApp();
  const [params, setParams] = useSearchParams();
  const { filters, mode } = useMemo(() => paramsToState(params), [params]);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const update = (f: SearchFilters, m: SearchMode = mode) =>
    setParams(stateToParams(f, m), { replace: true });

  const result = useAsync(async () => {
    if (mode.ai) {
      return app.search.aiSearch(filters, { useQueryPlanner: mode.planner });
    }
    return { hits: await app.search.search(filters), usedFallback: false };
  }, params.toString());

  const save = async (name: string) => {
    setAsking(false);
    if (name.trim() === '') return;
    if (!app.userId) {
      setNotice('Please sign in to save searches');
      return;
    }
    try {
      const saved = await app.savedSearches.save(app.userId, name, filters);
      setNotice(`Saved "${saved.name}"`);
    } catch (e) {
      setNotice(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="search-page">
      <SearchBar
        q={filters.q}
        mode={mode}
        onSubmit={(q) => update({ ...filters, q })}
        onMode={(m) => update(filters, m)}
        onSave={() => setAsking(true)}
      />
      <div role="status" aria-live="polite" className="notice">
        {notice}
      </div>
      <div className="search-page__body">
        <FiltersPanel filters={filters} onChange={(f) => update(f)} />
        <section className="results" aria-label="Results" aria-busy={result.loading}>
          {result.loading && !result.data && <p className="muted">Loading...</p>}
          {result.error && (
            <p className="error" role="alert">
              Error: {result.error.message}
            </p>
          )}
          {result.data?.usedFallback && result.data.hits.length > 0 && (
            <div className="banner">
              AI search returned no strong matches &mdash; showing standard search results.
            </div>
          )}
          {result.data && result.data.hits.length === 0 && !result.error && (
            <p className="muted">No results</p>
          )}
          {result.data?.hits.map((h) => <JobCard key={h.jobId} hit={h} />)}
        </section>
      </div>
      {asking && <NamePromptDialog onSubmit={save} onCancel={() => setAsking(false)} />}
    </div>
  );
}
