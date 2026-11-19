export function SetupRequiredPage() {
  return (
    <div className="center-page">
      <div className="card setup">
        <h1>JobObserver needs configuration</h1>
        <p>
          The Supabase backend is selected but the project URL or anon key is missing. Provide both
          in <code>.env.local</code> (see <code>.env.example</code>) and restart the dev server or
          rebuild:
        </p>
        <pre>
          {`VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://YOURREF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY`}
        </pre>
        <p>
          They are build-time values. To try the app without a backend, run <code>pnpm dev:mock</code>.
        </p>
      </div>
    </div>
  );
}
