import { useEffect, useState } from 'react';

import type {
  DocumentTarget,
  DocumentTargetProvider,
} from '../host/documents.js';

export type DocumentLinkPickerProps = {
  readonly provider: DocumentTargetProvider;
  readonly onSelect: (target: DocumentTarget) => void;
  readonly onCancel?: (() => void) | undefined;
};

export function DocumentLinkPicker({
  provider,
  onSelect,
  onCancel,
}: DocumentLinkPickerProps) {
  const [query, setQuery] = useState('');
  const [targets, setTargets] = useState<readonly DocumentTarget[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void provider.search(query, controller.signal).then(
      (results) => {
        setTargets(results);
        setState('idle');
      },
      () => {
        if (!controller.signal.aborted) setState('error');
      },
    );
    return () => controller.abort();
  }, [provider, query]);
  return (
    <section aria-label="Link to document" className="scriptr-document-picker">
      <header>
        <strong>Link to document</strong>
        {onCancel ? (
          <button
            aria-label="Close document picker"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        ) : null}
      </header>
      <input
        aria-label="Search documents"
        autoFocus
        placeholder="Find a document…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel?.();
          if (event.key === 'Enter' && targets[0]) onSelect(targets[0]);
        }}
      />
      <div role="listbox">
        {targets.map((target) => (
          <button
            key={target.id}
            onClick={() => onSelect(target)}
            role="option"
            type="button"
          >
            <span>{target.label}</span>
            {target.description ? <small>{target.description}</small> : null}
          </button>
        ))}
      </div>
      <p role="status">
        {state === 'loading'
          ? 'Searching…'
          : state === 'error'
            ? 'Documents unavailable.'
            : targets.length
              ? ''
              : 'No documents found.'}
      </p>
    </section>
  );
}
