import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './app/app-context';
import { AppShell } from './ui/components/AppShell';
import { JobDetailPage } from './ui/pages/JobDetailPage';
import { LoginPage } from './ui/pages/LoginPage';
import { SavedSearchesPage } from './ui/pages/SavedSearchesPage';
import { SearchPage } from './ui/pages/SearchPage';
import { SettingsPage } from './ui/pages/SettingsPage';

// Same guard rules as the desktop router: signed out -> /login, signed in at /login -> /search.
function RequireAuth() {
  const { userId } = useApp();
  if (userId === undefined) return <p className="muted page-pad">Loading...</p>;
  if (userId === null) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function LoginRoute() {
  const { userId } = useApp();
  if (userId === undefined) return <p className="muted page-pad">Loading...</p>;
  if (userId) return <Navigate to="/search" replace />;
  return <LoginPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<RequireAuth />}>
        <Route path="/search" element={<SearchPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/saved" element={<SavedSearchesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/search" replace />} />
    </Routes>
  );
}
