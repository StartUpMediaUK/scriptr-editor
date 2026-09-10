import { useMemo, useState } from 'react';

import type { ScriptureAddress } from '../document/types.js';
import {
  formatScriptureAddress,
  parseReferenceQuery,
} from '../scripture/address.js';
import type { ScriptureStructure } from '../scripture/types.js';

export type ScripturePickerProps = {
  readonly structure: ScriptureStructure;
  readonly initialQuery?: string | undefined;
  readonly onSelect: (address: ScriptureAddress) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly offline?: boolean | undefined;
  readonly className?: string | undefined;
};

export function ScripturePicker({
  structure,
  initialQuery = '',
  onSelect,
  onCancel,
  offline = false,
  className,
}: ScripturePickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const result = useMemo(
    () => parseReferenceQuery(query, structure),
    [query, structure],
  );
  const book = result.books.length === 1 ? result.books[0] : undefined;
  const options = useMemo(() => {
    if (!book) {
      return result.books.map((candidate) => ({
        label: candidate.name,
        query: candidate.name,
      }));
    }
    if (result.stage === 'chapter') {
      return book.chapters.map((_, index) => ({
        label: String(index + 1),
        query: `${book.name} ${index + 1}`,
      }));
    }
    if (result.stage === 'verse' && result.address) {
      const verseCount = book.chapters[result.address.chapter - 1] ?? 0;
      return Array.from({ length: verseCount }, (_, index) => ({
        label: String(index + 1),
        query: `${book.name} ${result.address?.chapter}:${index + 1}`,
      }));
    }
    if (result.stage === 'range' && result.address?.verseStart) {
      const verseCount = book.chapters[result.address.chapter - 1] ?? 0;
      return Array.from(
        { length: verseCount - result.address.verseStart + 1 },
        (_, index) => {
          const verse = result.address?.verseStart ?? 1;
          const end = verse + index;
          return {
            label: end === verse ? 'This verse' : `–${end}`,
            query:
              end === verse
                ? `${book.name} ${result.address?.chapter}:${verse}`
                : `${book.name} ${result.address?.chapter}:${verse}-${end}`,
          };
        },
      );
    }
    return [];
  }, [book, result]);

  const chooseQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(0);
  };
  const submit = () => {
    if (result.address && !result.error) onSelect(result.address);
  };

  return (
    <section
      aria-label="Choose Scripture reference"
      className={['scriptr-scripture-picker', className]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="scriptr-scripture-picker__header">
        <div>
          <p className="scriptr-scripture-picker__eyebrow">Scripture</p>
          <h2>Choose a reference</h2>
        </div>
        {onCancel ? (
          <button
            aria-label="Close Scripture picker"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        ) : null}
      </header>
      <label className="scriptr-scripture-picker__search">
        <span className="sr-only">Bible reference</span>
        <input
          autoFocus
          autoComplete="off"
          placeholder="Romans 8:28-30"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onCancel) onCancel();
            if (options.length && event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % options.length);
            }
            if (options.length && event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex(
                (index) => (index - 1 + options.length) % options.length,
              );
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const option = options[activeIndex];
              if (option) chooseQuery(option.query);
              else submit();
            }
          }}
        />
        {offline ? <small>Reference selection available offline</small> : null}
      </label>
      <p className="scriptr-scripture-picker__step" aria-live="polite">
        {result.error ??
          {
            book: 'Choose a book',
            chapter: 'Choose a chapter',
            verse: 'Choose a verse',
            range: 'Choose an ending verse, or insert this verse',
            complete: 'Reference ready',
          }[result.stage]}
      </p>
      {options.length ? (
        <div className="scriptr-scripture-picker__options" role="listbox">
          {options.map((option, index) => (
            <button
              aria-selected={index === activeIndex}
              data-active={index === activeIndex || undefined}
              key={option.query}
              onClick={() => chooseQuery(option.query)}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <footer className="scriptr-scripture-picker__footer">
        <span>
          {result.address && !result.error
            ? formatScriptureAddress(result.address, structure)
            : 'Type a book name or abbreviation'}
        </span>
        <button
          className="scriptr-scripture-picker__insert"
          disabled={!result.address || Boolean(result.error)}
          onClick={submit}
          type="button"
        >
          Insert reference
        </button>
      </footer>
    </section>
  );
}
