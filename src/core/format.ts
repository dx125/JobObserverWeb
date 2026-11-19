// Display helpers, ported from the desktop JobCard / SavedSearchesPage / FiltersPanel.

import type { SavedSearch, SearchHit } from './models';

export function titleCaseOption(s: string): string {
  const spaced = s.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function readableRemote(s: string): string {
  switch (s) {
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    case 'onsite':
      return 'On-site';
    default:
      return s;
  }
}

function shortNumber(v: number): string {
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

export function formatSalary(
  h: Pick<SearchHit, 'salaryMin' | 'salaryMax' | 'salaryCurrency'>,
): string | null {
  if (h.salaryMin == null && h.salaryMax == null) return null;
  const cur = h.salaryCurrency ?? '';
  if (h.salaryMin != null && h.salaryMax != null && h.salaryMin !== h.salaryMax) {
    return `${cur} ${shortNumber(h.salaryMin)}–${shortNumber(h.salaryMax)}`.trim();
  }
  const v = (h.salaryMin ?? h.salaryMax) as number;
  return `${cur} ${shortNumber(v)}`.trim();
}

export function formatPosted(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days >= 30) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours >= 1) return `${hours}h ago`;
  return 'just now';
}

export function formatSalaryFilterLabel(salaryMin: number | null): string {
  return salaryMin == null ? 'any' : `$${Math.round(salaryMin / 1000)}k`;
}

export function summarizeSavedSearch(s: SavedSearch): string {
  const parts: string[] = [];
  if (s.filters.q) parts.push(`"${s.filters.q}"`);
  if (s.filters.remoteTypes.length > 0) parts.push(s.filters.remoteTypes.join('/'));
  if (s.filters.salaryMin != null) parts.push(`≥ $${Math.round(s.filters.salaryMin / 1000)}k`);
  return parts.length === 0 ? '(no filters)' : parts.join(' · ');
}

/** Only http(s) links are ever rendered as anchors (job data comes from scraped sources). */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}
