import { useState } from 'react';
import { useApp } from '../../app/app-context';

export function SettingsPage() {
  const app = useApp();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="page-pad">
      <h1>Settings</h1>
      <p>Signed in as: {app.userId ?? '(not signed in)'}</p>
      <p className="muted">Backend: {app.backendId}</p>
      <p>
        <button className="btn" disabled={!app.userId} onClick={() => app.auth.signOut()}>
          Sign out
        </button>
      </p>
      <h2>Cache</h2>
      <p>
        <button
          className="btn"
          onClick={() => {
            app.search.clearCache();
            setMsg('Cache cleared');
          }}
        >
          Clear local search cache
        </button>
      </p>
      <div role="status" aria-live="polite" className="notice">
        {msg}
      </div>
    </div>
  );
}
