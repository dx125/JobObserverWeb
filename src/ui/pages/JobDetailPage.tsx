import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../app/app-context';
import { useAsync } from '../../app/use-async';
import { safeExternalUrl } from '../../core/format';
import type { Job, JobSource } from '../../core/models';
import { HtmlContent } from '../components/HtmlContent';

function SourcesPanel(props: { sources: JobSource[] | undefined; error: Error | undefined }) {
  return (
    <aside className="card sources" aria-label="Sources">
      <h2>Sources</h2>
      {props.error && <p className="error">Error: {props.error.message}</p>}
      {!props.error && !props.sources && <p className="muted">Loading...</p>}
      {props.sources?.length === 0 && <p className="muted">No source provenance recorded.</p>}
      <ul className="sources__list">
        {props.sources?.map((s) => {
          const href = safeExternalUrl(s.sourceUrl);
          return (
            <li key={s.id}>
              <div>
                <strong>{s.connectorId}</strong>
                <div className="muted">
                  {s.instanceKey} &middot; {s.sourceType}
                </div>
              </div>
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.connectorId} source`}>
                  Open
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function JobBody({ job }: { job: Job }) {
  const url = safeExternalUrl(job.canonicalUrl);
  return (
    <article className="job-detail__main">
      <h1>{job.title}</h1>
      <div className="job-detail__company">{job.companyName}</div>
      {job.locationRaw && <div className="muted">{job.locationRaw}</div>}
      {url && (
        <p>
          <a className="btn btn--primary" href={url} target="_blank" rel="noopener noreferrer">
            View original
          </a>
        </p>
      )}
      {job.descriptionHtml ? (
        <HtmlContent html={job.descriptionHtml} />
      ) : (
        <p className="pre-wrap">{job.descriptionText}</p>
      )}
    </article>
  );
}

export function JobDetailPage() {
  const { id = '' } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const job = useAsync(() => app.jobs.getJob(id), `job:${id}`);
  const sources = useAsync(() => app.jobs.getSources(id), `sources:${id}`);

  // Preserve the search the user came from (filters live in the URL); deep links fall back.
  const canGoBack = location.key !== 'default';

  return (
    <div className="job-detail">
      <div className="job-detail__bar">
        {canGoBack ? (
          <button className="btn btn--text" onClick={() => navigate(-1)}>
            &larr; Back to results
          </button>
        ) : (
          <Link className="btn btn--text" to="/search">
            &larr; Back to search
          </Link>
        )}
      </div>
      {job.loading && !job.data && <p className="muted">Loading...</p>}
      {job.error && (
        <p className="error" role="alert">
          Error: {job.error.message}
        </p>
      )}
      {!job.loading && !job.error && job.data === null && <p>Not found</p>}
      {job.data && (
        <div className="job-detail__layout">
          <JobBody job={job.data} />
          <SourcesPanel sources={sources.data} error={sources.error} />
        </div>
      )}
    </div>
  );
}
