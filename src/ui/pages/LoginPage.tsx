import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../app/app-context';

export function LoginPage() {
  const app = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signUpMode, setSignUpMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (signUpMode) {
        const res = await app.auth.signUp(email.trim(), password);
        if (res.needsConfirmation) {
          setInfo('Check your e-mail to confirm your account, then sign in.');
          setSignUpMode(false);
          return;
        }
      } else {
        await app.auth.signIn(email.trim(), password);
      }
      navigate('/search');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card login" onSubmit={submit}>
        <h1>{signUpMode ? 'Create account' : 'Sign in'}</h1>
        {app.sandbox && (
          <div className="banner">
            {app.sandbox.acceptsAnyCredentials ? (
              <>Demo mode &mdash; no real backend. Any e-mail and password will sign you in. </>
            ) : (
              <>
                Sandbox mode &mdash; no real backend. Use <code>{app.sandbox.demoEmail}</code> /{' '}
                <code>{app.sandbox.demoPassword}</code> or sign up with anything.{' '}
              </>
            )}
            <button
              type="button"
              className="btn btn--text"
              onClick={() => {
                setEmail(app.sandbox?.demoEmail ?? '');
                setPassword(app.sandbox?.demoPassword ?? '');
              }}
            >
              Fill demo account
            </button>
          </div>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            autoComplete={signUpMode ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {info && <p role="status">{info}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {signUpMode ? 'Sign up' : 'Sign in'}
        </button>
        <button
          type="button"
          className="btn btn--text"
          disabled={busy}
          onClick={() => setSignUpMode(!signUpMode)}
        >
          {signUpMode ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  );
}
