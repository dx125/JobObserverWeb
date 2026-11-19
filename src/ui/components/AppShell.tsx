import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../../app/app-context';

const NAV = [
  { to: '/search', label: 'Search' },
  { to: '/saved', label: 'Saved' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const { sandbox } = useApp();
  return (
    <div className="shell">
      <nav className="shell__nav" aria-label="Main">
        <div className="shell__brand">JobObserver</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) => `shell__link${isActive ? ' shell__link--active' : ''}`}
          >
            {n.label}
          </NavLink>
        ))}
        {sandbox && (
          <span className="badge" title="Data is generated in your browser; nothing is sent anywhere">
            Sandbox
          </span>
        )}
      </nav>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
