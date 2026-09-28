import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '../components/ui/combobox.js';
import type {
  DocumentTarget,
  DocumentTargetProvider,
} from '../host/documents.js';

export type DocumentLinkPickerProps = {
  readonly provider: DocumentTargetProvider;
  readonly onSelect: (target: DocumentTarget) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly selectedTargetId?: string | undefined;
};

export function DocumentLinkPicker({
  provider,
  onSelect,
  onCancel,
  onRemove,
  selectedTargetId,
}: DocumentLinkPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<readonly DocumentTarget[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void provider.search(query, controller.signal).then(
      (results) => {
        setTargets(results);
        setState('idle');
        if (query && results.length) setOpen(true);
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
          <Button
            aria-label="Close document picker"
            onClick={onCancel}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        ) : null}
      </header>
      <Combobox<DocumentTarget>
        inputValue={query}
        itemToStringLabel={(target) => target.label}
        items={targets}
        onInputValueChange={(value) => {
          setQuery(value);
          setOpen(true);
        }}
        onOpenChange={setOpen}
        onValueChange={(target) => {
          if (target) {
            setOpen(false);
            onSelect(target);
          }
        }}
        open={open}
      >
        <ComboboxInput
          aria-label="Search documents"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel?.();
          }}
          placeholder="Find a document…"
          showClear
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxGroup>
              {targets.map((target) => (
                <ComboboxItem key={target.id} value={target}>
                  <span>{target.label}</span>
                  {target.description ? (
                    <small>{target.description}</small>
                  ) : null}
                </ComboboxItem>
              ))}
            </ComboboxGroup>
            <ComboboxEmpty>No documents found.</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p role="status">
        {state === 'loading'
          ? 'Searching…'
          : state === 'error'
            ? 'Documents unavailable.'
            : targets.length
              ? ''
              : 'No documents found.'}
      </p>
      {selectedTargetId && onRemove ? (
        <Button onClick={onRemove} type="button" variant="outline">
          Remove document link
        </Button>
      ) : null}
    </section>
  );
}
