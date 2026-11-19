import { useEffect, useState } from 'react';
import { formatSalaryFilterLabel, titleCaseOption } from '../../core/format';
import {
  EMPLOYMENT_TYPE_OPTIONS,
  REMOTE_TYPE_OPTIONS,
  SENIORITY_OPTIONS,
  type SearchFilters,
  type SearchSort,
} from '../../core/models';

interface Props {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
}

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: 'Relevance',
  recent: 'Most recent',
  salaryDesc: 'Salary (desc)',
};

function MultiToggle(props: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="filter-group">
      <legend>{props.legend}</legend>
      <div className="toggle-row">
        {props.options.map((o) => {
          const on = props.selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              className={`toggle${on ? ' toggle--on' : ''}`}
              aria-pressed={on}
              onClick={() =>
                props.onChange(on ? props.selected.filter((x) => x !== o) : [...props.selected, o])
              }
            >
              {titleCaseOption(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FiltersPanel({ filters, onChange }: Props) {
  // The slider updates locally while dragging and commits on release, so one drag = one search
  // (the desktop app fires a request per slider step).
  const [salary, setSalary] = useState(filters.salaryMin ?? 0);
  useEffect(() => setSalary(filters.salaryMin ?? 0), [filters.salaryMin]);
  const commitSalary = (v: number) => {
    const next = v > 0 ? v : null;
    if (next !== filters.salaryMin) onChange({ ...filters, salaryMin: next });
  };

  return (
    <aside className="filters" aria-label="Filters">
      <h2 className="filters__title">Filters</h2>
      <MultiToggle
        legend="Remote type"
        options={REMOTE_TYPE_OPTIONS}
        selected={filters.remoteTypes}
        onChange={(v) => onChange({ ...filters, remoteTypes: v })}
      />
      <MultiToggle
        legend="Employment"
        options={EMPLOYMENT_TYPE_OPTIONS}
        selected={filters.employmentTypes}
        onChange={(v) => onChange({ ...filters, employmentTypes: v })}
      />
      <MultiToggle
        legend="Seniority"
        options={SENIORITY_OPTIONS}
        selected={filters.seniorities}
        onChange={(v) => onChange({ ...filters, seniorities: v })}
      />
      <div className="filter-group">
        <label htmlFor="min-salary">
          Min salary: <strong>{formatSalaryFilterLabel(salary > 0 ? salary : null)}</strong>
        </label>
        <input
          id="min-salary"
          type="range"
          min={0}
          max={250000}
          step={10000}
          value={salary}
          onChange={(e) => setSalary(e.currentTarget.valueAsNumber)}
          onPointerUp={(e) => commitSalary(e.currentTarget.valueAsNumber)}
          onKeyUp={(e) => commitSalary(e.currentTarget.valueAsNumber)}
          onBlur={(e) => commitSalary(e.currentTarget.valueAsNumber)}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="sort">Sort</label>
        <select
          id="sort"
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.currentTarget.value as SearchSort })}
        >
          {(Object.keys(SORT_LABELS) as SearchSort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
