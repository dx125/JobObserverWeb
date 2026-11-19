// Deterministic sandbox dataset. A seeded PRNG keeps the data stable across reloads and tests;
// dates are generated relative to `now` so "posted 3d ago" always looks realistic.

import type { Job, JobSource } from '../../core/models';

export interface MockJob extends Job {
  sources: JobSource[];
  /** 0..1, stands in for the backend's quality_score (used by mock AI ranking) */
  quality: number;
  tags: string[];
}

/** Fixed id so tests and docs can reference the XSS fixture job. */
export const SANITIZATION_FIXTURE_ID = 'mock-job-fixture-xss';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RoleTemplate {
  title: string;
  tags: string[];
  blurb: string;
}

const ROLES: RoleTemplate[] = [
  { title: 'Backend Engineer', tags: ['go', 'postgresql', 'kubernetes', 'grpc'], blurb: 'Design and run high-throughput services.' },
  { title: 'Backend Engineer', tags: ['java', 'spring', 'kafka', 'aws'], blurb: 'Own payment and ledger services end to end.' },
  { title: 'Backend Engineer', tags: ['python', 'django', 'postgresql', 'redis'], blurb: 'Build APIs powering a marketplace.' },
  { title: 'Frontend Engineer', tags: ['react', 'typescript', 'graphql', 'css'], blurb: 'Craft fast, accessible interfaces.' },
  { title: 'Full-Stack Engineer', tags: ['typescript', 'node', 'react', 'postgresql'], blurb: 'Ship features across the whole stack.' },
  { title: 'Data Engineer', tags: ['python', 'spark', 'airflow', 'snowflake'], blurb: 'Build the pipelines our analysts rely on.' },
  { title: 'DevOps Engineer', tags: ['terraform', 'aws', 'kubernetes', 'ci/cd'], blurb: 'Make deploys boring and infrastructure reproducible.' },
  { title: 'Mobile Engineer', tags: ['flutter', 'dart', 'kotlin', 'swift'], blurb: 'Build a cross-platform mobile app used daily.' },
  { title: 'Machine Learning Engineer', tags: ['python', 'pytorch', 'mlops', 'embeddings'], blurb: 'Take models from notebook to production.' },
  { title: 'QA Automation Engineer', tags: ['playwright', 'typescript', 'ci/cd', 'testing'], blurb: 'Raise quality with robust automated suites.' },
  { title: 'Rust Engineer', tags: ['rust', 'webassembly', 'linux', 'systems'], blurb: 'Write safe, fast systems code.' },
  { title: '.NET Engineer', tags: ['csharp', 'dotnet', 'azure', 'sql'], blurb: 'Evolve a large .NET platform.' },
];

const COMPANIES = [
  'Northwind Labs', 'Acme Robotics', 'Globex Systems', 'Initech', 'Umbrella Data',
  'Hooli', 'Stark Software', 'Wayne Logistics', 'Tyrell Cloud', 'Cyberdyne Apps',
  'Soylent Pay', 'Vandelay Industries', 'Pied Piper', 'Aperture Works',
];

interface Place {
  raw: string;
  codes: string[];
  scope: string;
  currency: string;
}

const PLACES: Place[] = [
  { raw: 'Berlin, Germany', codes: ['DE'], scope: 'country', currency: 'EUR' },
  { raw: 'Amsterdam, Netherlands', codes: ['NL'], scope: 'country', currency: 'EUR' },
  { raw: 'Lisbon, Portugal', codes: ['PT'], scope: 'country', currency: 'EUR' },
  { raw: 'London, United Kingdom', codes: ['GB'], scope: 'country', currency: 'GBP' },
  { raw: 'Warsaw, Poland', codes: ['PL'], scope: 'country', currency: 'EUR' },
  { raw: 'New York, USA', codes: ['US'], scope: 'country', currency: 'USD' },
  { raw: 'Austin, USA', codes: ['US'], scope: 'country', currency: 'USD' },
  { raw: 'Toronto, Canada', codes: ['CA'], scope: 'country', currency: 'USD' },
  { raw: 'Remote - Europe', codes: ['DE', 'NL', 'PT', 'PL', 'GB'], scope: 'region', currency: 'EUR' },
  { raw: 'Remote - Worldwide', codes: [], scope: 'worldwide', currency: 'USD' },
  { raw: 'Remote - LATAM', codes: ['BR', 'AR', 'MX'], scope: 'region', currency: 'USD' },
];

const SENIORITIES = ['junior', 'mid', 'senior', 'senior', 'staff', 'lead', 'principal'] as const;
const SENIORITY_LABEL: Record<string, string> = {
  junior: 'Junior',
  mid: '',
  senior: 'Senior',
  staff: 'Staff',
  lead: 'Lead',
  principal: 'Principal',
};
const SENIORITY_BASE: Record<string, number> = {
  junior: 45_000, mid: 65_000, senior: 90_000, staff: 120_000, lead: 115_000, principal: 140_000,
};
const EMPLOYMENT = ['full_time', 'full_time', 'full_time', 'full_time', 'contract', 'part_time', 'internship'] as const;
const REMOTE = ['remote', 'remote', 'hybrid', 'onsite'] as const;

const CONNECTORS: { id: string; type: string }[] = [
  { id: 'greenhouse', type: 'ats_api' },
  { id: 'lever', type: 'ats_api' },
  { id: 'ashby', type: 'ats_api' },
  { id: 'remotive', type: 'aggregator' },
  { id: 'arbeitnow', type: 'aggregator' },
  { id: 'telegram', type: 'telegram' },
];

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function generateMockJobs(now: Date = new Date(), count = 60, seed = 20260101): MockJob[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
  const dayMs = 86_400_000;
  const jobs: MockJob[] = [];

  for (let i = 0; i < count; i++) {
    const role = pick(ROLES);
    const seniority = pick(SENIORITIES);
    const company = pick(COMPANIES);
    const remoteType = pick(REMOTE);
    // Remote roles live in a "Remote - ..." place; others in a city.
    const place =
      remoteType === 'remote'
        ? (PLACES.filter((p) => p.raw.startsWith('Remote')) as Place[])[Math.floor(rnd() * 3)]!
        : pick(PLACES.filter((p) => !p.raw.startsWith('Remote')));
    const employment = pick(EMPLOYMENT);
    const hasSalary = rnd() < 0.7;
    const base = SENIORITY_BASE[seniority] ?? 70_000;
    const salaryMin = hasSalary ? Math.round((base * (0.85 + rnd() * 0.3)) / 1000) * 1000 : null;
    const salaryMax = salaryMin != null ? Math.round((salaryMin * (1.15 + rnd() * 0.25)) / 1000) * 1000 : null;
    const ageDays = Math.floor(rnd() * 45);
    const postedAt = new Date(now.getTime() - ageDays * dayMs - Math.floor(rnd() * dayMs));
    const lastSeen = new Date(now.getTime() - Math.floor(rnd() * 2 * dayMs));
    const label = SENIORITY_LABEL[seniority];
    const title = `${label ? `${label} ` : ''}${role.title}`;
    const id = `mock-job-${String(i + 1).padStart(3, '0')}`;

    const sourceCount = 1 + Math.floor(rnd() * 3);
    const sources: JobSource[] = [];
    const used = new Set<string>();
    for (let s = 0; s < sourceCount; s++) {
      const c = pick(CONNECTORS);
      if (used.has(c.id)) continue;
      used.add(c.id);
      sources.push({
        id: `${id}-src-${s + 1}`,
        connectorId: c.id,
        instanceKey: c.type === 'telegram' ? `@${slug(company)}_jobs` : slug(company),
        sourceUrl: `https://example.com/${c.id}/${slug(company)}/${id}`,
        sourceType: c.type,
        lastSeenAt: lastSeen.toISOString(),
      });
    }

    const html =
      `<h3>About the role</h3><p>${role.blurb} ${company} is hiring a ${title}.</p>` +
      `<h3>What you will use</h3><ul>${role.tags.map((t) => `<li>${t}</li>`).join('')}</ul>` +
      `<h3>Details</h3><p>${place.raw} · ${remoteType} · ${employment.replace('_', ' ')}.</p>`;
    const text =
      `${role.blurb} ${company} is hiring a ${title}. Stack: ${role.tags.join(', ')}. ` +
      `Location: ${place.raw}. ${remoteType}. ${employment.replace('_', ' ')}.`;

    jobs.push({
      id,
      title,
      companyName: company,
      locationRaw: place.raw,
      remoteType,
      remoteScope: remoteType === 'remote' ? place.scope : 'unknown',
      employmentType: employment,
      seniority,
      salaryMin,
      salaryMax,
      salaryCurrency: salaryMin != null ? place.currency : null,
      // Every 7th job has no HTML so the plain-text fallback path is exercised.
      descriptionHtml: i % 7 === 6 ? null : html,
      descriptionText: text,
      postedAt: i % 11 === 10 ? null : postedAt.toISOString(),
      firstSeenAt: new Date(postedAt.getTime() + dayMs / 2).toISOString(),
      lastSeenAt: lastSeen.toISOString(),
      canonicalUrl: `https://example.com/jobs/${id}`,
      countryCodes: place.codes,
      sources,
      quality: 0.5 + rnd() * 0.5,
      tags: role.tags,
    });
  }

  jobs.push(sanitizationFixture(now));
  return jobs;
}

/**
 * A job whose scraped content is hostile. The UI must neutralize the script/handler and refuse the
 * javascript: link; used by the sandbox for manual checks and by tests (docs/DECISIONS.md ADR-007).
 */
function sanitizationFixture(now: Date): MockJob {
  const iso = now.toISOString();
  return {
    id: SANITIZATION_FIXTURE_ID,
    title: 'Sandbox Sanitization Fixture',
    companyName: 'Mallory Corp',
    locationRaw: 'Remote - Worldwide',
    remoteType: 'remote',
    remoteScope: 'worldwide',
    employmentType: 'contract',
    seniority: 'mid',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    descriptionHtml:
      '<p>Safe paragraph.</p><script>window.__xss = true</script>' +
      '<img src="x" onerror="window.__xss = true"><a href="javascript:window.__xss=true">bad link</a>' +
      '<a href="https://example.com/ok">good link</a>',
    descriptionText: 'Safe paragraph.',
    postedAt: iso,
    firstSeenAt: iso,
    lastSeenAt: iso,
    canonicalUrl: 'javascript:window.__xss=true',
    countryCodes: [],
    sources: [
      {
        id: `${SANITIZATION_FIXTURE_ID}-src-1`,
        connectorId: 'telegram',
        instanceKey: '@mallory_jobs',
        sourceUrl: 'javascript:window.__xss=true',
        sourceType: 'telegram',
        lastSeenAt: iso,
      },
    ],
    quality: 0.1,
    tags: ['security', 'fixture'],
  };
}
