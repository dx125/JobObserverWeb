import { useEffect, useRef, useState, type FormEvent } from 'react';

export function NamePromptDialog(props: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit(name);
  };

  return (
    <div className="modal-backdrop" onClick={props.onCancel}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
        onSubmit={submit}
      >
        <h2 id="name-dialog-title">Name this search</h2>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="e.g. Senior Go Remote"
          aria-label="Search name"
        />
        <div className="modal__actions">
          <button type="button" className="btn btn--text" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
