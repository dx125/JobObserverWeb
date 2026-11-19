import { Link } from 'react-router-dom';
import { formatPosted, formatSalary, readableRemote } from '../../core/format';
import type { SearchHit } from '../../core/models';

export function JobCard({ hit }: { hit: SearchHit }) {
  const salary = formatSalary(hit);
  const posted = hit.postedAt ?? hit.firstSeenAt;
  return (
    <Link to={`/jobs/${encodeURIComponent(hit.jobId)}`} className="job-card">
      <h3 className="job-card__title">{hit.title}</h3>
      <div className="job-card__company">{hit.companyName}</div>
      <ul className="chips">
        {hit.locationRaw && <li className="chip">{hit.locationRaw}</li>}
        <li className="chip">{readableRemote(hit.remoteType)}</li>
        {salary && <li className="chip">{salary}</li>}
        <li className="chip">{formatPosted(posted)}</li>
        {hit.sourceCount > 1 && <li className="chip">{hit.sourceCount} sources</li>}
      </ul>
    </Link>
  );
}
