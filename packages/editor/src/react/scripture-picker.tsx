import { useMemo, useState } from 'react';

import type { ScriptureAddress } from '../document/types.js';
import {
  formatScriptureAddress,
  parseReferenceQuery,
} from '../scripture/address.js';
import type {
  ScriptureBookStructure,
  ScriptureStructure,
} from '../scripture/types.js';

export type ScripturePickerProps = {
  readonly structure: ScriptureStructure;
  readonly initialQuery?: string | undefined;
  readonly onSelect: (address: ScriptureAddress) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly offline?: boolean | undefined;
  readonly className?: string | undefined;
  readonly translationId?: string | undefined;
};

export function ScripturePicker({
  structure,
  initialQuery = '',
  onSelect,
  onCancel,
  offline = false,
  className,
  translationId,
}: ScripturePickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [previewQuery, setPreviewQuery] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedBookId, setSelectedBookId] = useState<string>();
  const result = useMemo(
    () => parseReferenceQuery(query, structure),
    [query, structure],
  );
  const book =
    structure.books.find((candidate) => candidate.id === selectedBookId) ??
    (result.books.length === 1 ? result.books[0] : undefined);
  const nameOf = (candidate: ScriptureBookStructure) =>
    candidate.translationNames?.[translationId ?? ''] ?? candidate.name;
  const options = useMemo(() => {
    if (!book) return [];
    if (
      result.stage === 'chapter' ||
      (result.stage === 'book' && selectedBookId)
    )
      return book.chapters.map((_, index) => ({
        label: String(index + 1),
        query: `${nameOf(book)} ${index + 1}`,
      }));
    if (
      (result.stage === 'verse' ||
        result.stage === 'range' ||
        result.stage === 'complete') &&
      result.address
    ) {
      const verseCount = book.chapters[result.address.chapter - 1] ?? 0;
      return Array.from({ length: verseCount }, (_, index) => ({
        label: String(index + 1),
        query: `${nameOf(book)} ${result.address?.chapter}:${index + 1}`,
      }));
    }
    return [];
  }, [book, result, selectedBookId, translationId]);
  const chooseQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setPreviewQuery(undefined);
    setActiveIndex(0);
  };
  const rangeQuery = (verse: number) => {
    const start = result.address?.verseStart;
    if (!book || !result.address || !start) return;
    const low = Math.min(start, verse);
    const high = Math.max(start, verse);
    return `${nameOf(book)} ${result.address.chapter}:${low}${low === high ? '' : `-${high}`}`;
  };
  const chooseVerse = (verse: number, fallback: string) =>
    chooseQuery(rangeQuery(verse) ?? fallback);
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
          value={previewQuery ?? query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setSelectedBookId(undefined);
            setPreviewQuery(undefined);
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
            range: 'Select another verse for a range, or insert this verse',
            complete: 'Reference ready',
          }[result.stage]}
      </p>
      {!book && result.books.length ? (
        <div className="scriptr-scripture-picker__book-groups" role="listbox">
          {(['old', 'new', 'other'] as const).map((testament) => {
            const books = result.books.filter((candidate) =>
              testament === 'other'
                ? !candidate.testament
                : candidate.testament === testament,
            );
            if (!books.length) return null;
            return (
              <section key={testament}>
                <p>
                  {testament === 'old'
                    ? 'Old Testament'
                    : testament === 'new'
                      ? 'New Testament'
                      : 'Books'}
                </p>
                {books.map((candidate) => (
                  <button
                    key={candidate.id}
                    onClick={() => {
                      setSelectedBookId(candidate.id);
                      chooseQuery(nameOf(candidate));
                    }}
                    role="option"
                    type="button"
                  >
                    {nameOf(candidate)}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : options.length ? (
        <div className="scriptr-scripture-picker__options" role="listbox">
          {options.map((option, index) => {
            const verse = Number(option.label);
            const start = result.address?.verseStart;
            const end = result.address?.verseEnd ?? start;
            const selected = Boolean(
              start && end && verse >= start && verse <= end,
            );
            return (
              <button
                aria-selected={selected || index === activeIndex}
                data-active={index === activeIndex || undefined}
                data-selected={selected || undefined}
                key={option.query}
                onClick={() =>
                  result.stage === 'chapter'
                    ? chooseQuery(option.query)
                    : chooseVerse(verse, option.query)
                }
                onMouseEnter={() => {
                  const preview = rangeQuery(verse);
                  if (preview) setPreviewQuery(preview);
                }}
                onMouseLeave={() => setPreviewQuery(undefined)}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            );
          })}
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
