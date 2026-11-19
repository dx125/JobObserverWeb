import { Link } from 'react-router-dom';
import { useApp } from '../../app/app-context';
import { useAsync } from '../../app/use-async';
import { summarizeSavedSearch } from '../../core/format';
import { stateToParams, DEFAULT_MODE } from '../../core/search-params';

export function SavedSearchesPage() {
  const app = useApp();
  const userId = app.userId;
  const list = useAsync(
    async () => (userId ? app.savedSearches.list(userId) : []),
    `saved:${userId ?? ''}`,
  );

  const remove = async (id: string) => {
    await app.savedSearches.remove(id);
    list.reload();
  };

  if (list.loading && !list.data) return <p className="muted page-pad">Loading...</p>;
  if (list.error) {
    return (
      <p className="error page-pad" role="alert">
        Error: {list.error.message}
      </p>
    );
  }
  if (!list.data || list.data.length === 0) {
    return <p className="muted page-pad">No saved searches yet</p>;
  }

  return (
    <div className="page-pad">
      <h1>Saved searches</h1>
      <ul className="saved-list">
        {list.data.map((s) => (
          <li key={s.id}>
            <div>
              <div className="saved-list__name">{s.name}</div>
              <div className="muted">{summarizeSavedSearch(s)}</div>
            </div>
            <div className="saved-list__actions">
              {/* Web-only addition: the desktop lists saved searches but cannot run them. */}
              <Link className="btn" to={`/search?${stateToParams(s.filters, DEFAULT_MODE).toString()}`}>
                Run
              </Link>
              <button className="btn btn--text" onClick={() => remove(s.id)} aria-label={`Delete ${s.name}`}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
