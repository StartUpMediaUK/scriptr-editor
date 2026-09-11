import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  ScriptureAddress,
  ScriptureBlock,
  TranslationComparisonBlock,
} from '../document/types.js';
import { createDocumentCodec } from '../document/codec.js';
import type {
  PassageText,
  ScriptureProvider,
  ScriptureTranslation,
} from '../host/scripture.js';
import {
  formatScriptureAddress,
  parseReferenceQuery,
} from '../scripture/address.js';
import type { ScriptureStructure } from '../scripture/types.js';

export type ScriptureBlockContentProps = {
  readonly block: ScriptureBlock | TranslationComparisonBlock;
  readonly provider?: ScriptureProvider | undefined;
  readonly editable?: boolean | undefined;
  readonly onChange?:
    | ((block: ScriptureBlock | TranslationComparisonBlock) => void)
    | undefined;
};

type ResolvedPassage =
  | { readonly state: 'loading' }
  | { readonly state: 'unavailable'; readonly message: string }
  | { readonly state: 'ready'; readonly passage: PassageText };

function moveTranslation(
  translationIds: readonly string[],
  from: number,
  to: number,
) {
  const next = [...translationIds];
  const selected = next[from];
  if (selected === undefined || to < 0 || to >= next.length) return next;
  next.splice(from, 1);
  next.splice(to, 0, selected);
  return next;
}

function useProviderMetadata(provider: ScriptureProvider | undefined) {
  const [structure, setStructure] = useState<ScriptureStructure>();
  const [translations, setTranslations] = useState<
    readonly ScriptureTranslation[]
  >([]);
  useEffect(() => {
    if (!provider) return;
    const controller = new AbortController();
    void Promise.all([
      provider.getStructure(controller.signal),
      provider.listTranslations(controller.signal),
    ]).then(
      ([nextStructure, nextTranslations]) => {
        setStructure(nextStructure);
        setTranslations(nextTranslations);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [provider]);
  return { structure, translations };
}

function Passage({
  address,
  provider,
  translation,
}: {
  readonly address: ScriptureAddress;
  readonly provider?: ScriptureProvider | undefined;
  readonly translation: ScriptureTranslation | undefined;
}) {
  const [resolved, setResolved] = useState<ResolvedPassage>({
    state: 'loading',
  });
  useEffect(() => {
    if (!provider || !translation) {
      setResolved({
        state: 'unavailable',
        message: provider
          ? 'Translation unavailable.'
          : 'Passage text is not available locally.',
      });
      return;
    }
    const controller = new AbortController();
    setResolved({ state: 'loading' });
    void provider.getPassage(address, translation.id, controller.signal).then(
      (passage) => setResolved({ state: 'ready', passage }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResolved({
          state: 'unavailable',
          message:
            error instanceof Error ? error.message : 'Passage unavailable.',
        });
      },
    );
    return () => controller.abort();
  }, [address, provider, translation]);

  return (
    <div className="scriptr-scripture__passage" data-state={resolved.state}>
      <strong>{translation?.abbreviation ?? 'Translation'}</strong>
      {resolved.state === 'ready' ? (
        <>
          <p>{resolved.passage.text}</p>
          <small>{resolved.passage.attribution}</small>
        </>
      ) : (
        <p role="status">
          {resolved.state === 'loading' ? 'Loading passage…' : resolved.message}
        </p>
      )}
    </div>
  );
}

function EditableAddress({
  address,
  structure,
  translationId,
  onCommit,
}: {
  readonly address: ScriptureAddress;
  readonly structure: ScriptureStructure;
  readonly translationId: string;
  readonly onCommit: (address: ScriptureAddress) => void;
}) {
  const book = structure.books.find(
    (candidate) => candidate.id === address.book,
  );
  const displayName =
    book?.translationNames?.[translationId] ?? book?.name ?? address.book;
  const [bookText, setBookText] = useState(displayName);
  const [chapterText, setChapterText] = useState(String(address.chapter));
  const [verseText, setVerseText] = useState(
    address.verseStart === undefined
      ? ''
      : `${address.verseStart}${address.verseEnd === undefined ? '' : `-${address.verseEnd}`}`,
  );
  const bookRef = useRef<HTMLInputElement>(null);
  const chapterRef = useRef<HTMLInputElement>(null);
  const verseRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setBookText(displayName);
    setChapterText(String(address.chapter));
    setVerseText(
      address.verseStart === undefined
        ? ''
        : `${address.verseStart}${address.verseEnd === undefined ? '' : `-${address.verseEnd}`}`,
    );
  }, [address, displayName]);
  const normalizedBookText = bookText.trim().toLocaleLowerCase();
  const matchingBook = structure.books.find((candidate) =>
    [
      candidate.translationNames?.[translationId],
      candidate.name,
      ...candidate.aliases,
    ]
      .filter((name): name is string => Boolean(name))
      .some((name) => name.toLocaleLowerCase() === normalizedBookText),
  );
  const suggestedBook = structure.books.find((candidate) => {
    const name = candidate.translationNames?.[translationId] ?? candidate.name;
    return (
      normalizedBookText.length > 0 &&
      name.toLocaleLowerCase().startsWith(normalizedBookText) &&
      name.toLocaleLowerCase() !== normalizedBookText
    );
  });
  const bookSuggestion = suggestedBook
    ? (suggestedBook.translationNames?.[translationId] ?? suggestedBook.name)
    : undefined;
  const acceptedBook = matchingBook ?? suggestedBook;
  const acceptedBookName = acceptedBook
    ? (acceptedBook.translationNames?.[translationId] ?? acceptedBook.name)
    : undefined;
  const commit = () => {
    const result = parseReferenceQuery(
      `${bookText} ${chapterText}${verseText ? `:${verseText}` : ''}`,
      structure,
    );
    if (result.address && !result.error) onCommit(result.address);
  };
  return (
    <div
      aria-label="Scripture address"
      className="scriptr-scripture__address-editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) commit();
      }}
      role="group"
    >
      <label className="scriptr-scripture__address-segment">
        <span aria-hidden="true">
          {bookText}
          {bookSuggestion ? (
            <i>{bookSuggestion.slice(bookText.length)}</i>
          ) : null}
        </span>
        <input
          aria-label="Bible book"
          autoComplete="off"
          onChange={(event) => setBookText(event.currentTarget.value)}
          onKeyDown={(event) => {
            const atEnd =
              event.currentTarget.selectionStart === bookText.length;
            if (
              acceptedBookName &&
              (event.key === 'Tab' ||
                event.key === 'Enter' ||
                (event.key === 'ArrowRight' && atEnd))
            ) {
              event.preventDefault();
              setBookText(acceptedBookName);
              chapterRef.current?.focus();
            }
          }}
          ref={bookRef}
          style={{
            width: `${Math.max(bookSuggestion?.length ?? bookText.length, 2)}ch`,
          }}
          value={bookText}
        />
      </label>
      <span aria-hidden="true" className="scriptr-scripture__book-gap" />
      <label className="scriptr-scripture__address-segment">
        <span aria-hidden="true">{chapterText}</span>
        <input
          aria-label="Chapter"
          inputMode="numeric"
          onChange={(event) =>
            setChapterText(event.currentTarget.value.replace(/\D/g, ''))
          }
          onKeyDown={(event) => {
            const atStart = event.currentTarget.selectionStart === 0;
            const atEnd =
              event.currentTarget.selectionStart === chapterText.length;
            if (
              (event.key === 'Backspace' && atStart) ||
              (event.key === 'ArrowLeft' && atStart)
            ) {
              event.preventDefault();
              bookRef.current?.focus();
            } else if (
              event.key === 'Enter' ||
              event.key === 'Tab' ||
              (event.key === 'ArrowRight' && atEnd)
            ) {
              event.preventDefault();
              verseRef.current?.focus();
            }
          }}
          ref={chapterRef}
          style={{ width: `${Math.max(chapterText.length, 1)}ch` }}
          value={chapterText}
        />
      </label>
      <span aria-hidden="true">:</span>
      <label className="scriptr-scripture__address-segment">
        <span aria-hidden="true">{verseText}</span>
        <input
          aria-label="Verse or range"
          inputMode="numeric"
          onChange={(event) =>
            setVerseText(event.currentTarget.value.replace(/[^\d-]/g, ''))
          }
          onKeyDown={(event) => {
            const atStart = event.currentTarget.selectionStart === 0;
            if (
              (event.key === 'Backspace' && atStart) ||
              (event.key === 'ArrowLeft' && atStart)
            ) {
              event.preventDefault();
              chapterRef.current?.focus();
            }
          }}
          ref={verseRef}
          style={{ width: `${Math.max(verseText.length, 1)}ch` }}
          value={verseText}
        />
      </label>
    </div>
  );
}

export function ScriptureBlockContent({
  block,
  provider,
  editable = false,
  onChange,
}: ScriptureBlockContentProps) {
  const { structure, translations } = useProviderMetadata(provider);
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);
  const translationIds =
    block.type === 'scripture' ? [block.translationId] : block.translationIds;
  const translationMap = useMemo(
    () =>
      new Map(translations.map((translation) => [translation.id, translation])),
    [translations],
  );
  const label = structure
    ? formatScriptureAddress(block.address, structure)
    : `${block.address.book} ${block.address.chapter}${
        block.address.verseStart ? `:${block.address.verseStart}` : ''
      }${block.address.verseEnd ? `–${block.address.verseEnd}` : ''}`;

  const replaceTranslations = (ids: readonly string[]) => {
    if (!onChange || block.type !== 'translationComparison' || ids.length === 0)
      return;
    onChange({ ...block, translationIds: ids });
  };

  return (
    <section
      className="scriptr-scripture"
      data-layout={
        block.type === 'translationComparison' ? block.layout : 'oneColumn'
      }
      data-type={block.type}
    >
      <header>
        {editable && structure ? (
          <EditableAddress
            address={block.address}
            onCommit={(address) => onChange?.({ ...block, address })}
            structure={structure}
            translationId={translationIds[0] ?? ''}
          />
        ) : (
          <span>{label}</span>
        )}
        {editable && translations.length ? (
          block.type === 'scripture' ? (
            <select
              aria-label="Scripture translation"
              value={block.translationId}
              onChange={(event) =>
                onChange?.({
                  ...block,
                  translationId: event.currentTarget.value,
                })
              }
            >
              {translations.map((translation) => (
                <option key={translation.id} value={translation.id}>
                  {translation.abbreviation}
                </option>
              ))}
            </select>
          ) : (
            <div className="scriptr-scripture__layout">
              <button
                aria-label="One column"
                aria-pressed={block.layout === 'oneColumn'}
                onClick={() => onChange?.({ ...block, layout: 'oneColumn' })}
                type="button"
              >
                ▰
              </button>
              <button
                aria-label="Two columns"
                aria-pressed={block.layout === 'twoColumn'}
                onClick={() => onChange?.({ ...block, layout: 'twoColumn' })}
                type="button"
              >
                ▥
              </button>
              <button
                aria-expanded={translationMenuOpen}
                aria-label="Add translation"
                onClick={() => setTranslationMenuOpen((open) => !open)}
                type="button"
              >
                ＋
              </button>
              {translationMenuOpen ? (
                <div
                  className="scriptr-scripture__translation-menu"
                  role="menu"
                >
                  {translations
                    .filter(
                      (translation) => !translationIds.includes(translation.id),
                    )
                    .map((translation) => (
                      <button
                        key={translation.id}
                        onClick={() => {
                          replaceTranslations([
                            ...translationIds,
                            translation.id,
                          ]);
                          setTranslationMenuOpen(false);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {translation.name}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </header>
      <div className="scriptr-scripture__passages">
        {translationIds.map((translationId, index) => (
          <div className="scriptr-scripture__translation" key={translationId}>
            <Passage
              address={block.address}
              provider={provider}
              translation={translationMap.get(translationId)}
            />
            {editable && block.type === 'translationComparison' ? (
              <div className="scriptr-scripture__translation-controls">
                <button
                  aria-label={`Move ${translationId} earlier`}
                  disabled={index === 0}
                  onClick={() =>
                    replaceTranslations(
                      moveTranslation(translationIds, index, index - 1),
                    )
                  }
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${translationId} later`}
                  disabled={index === translationIds.length - 1}
                  onClick={() =>
                    replaceTranslations(
                      moveTranslation(translationIds, index, index + 1),
                    )
                  }
                  type="button"
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove ${translationId}`}
                  disabled={translationIds.length === 1}
                  onClick={() =>
                    replaceTranslations(
                      translationIds.filter((id) => id !== translationId),
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ScriptureNodeView({
  node,
  updateAttributes,
  editor,
  provider,
}: NodeViewProps & { readonly provider?: ScriptureProvider | undefined }) {
  const parsed = createDocumentCodec().parse({
    version: 2,
    content: [JSON.parse(String(node.attrs.payload))],
  }).content[0];
  if (
    !parsed ||
    (parsed.type !== 'scripture' && parsed.type !== 'translationComparison')
  )
    return <NodeViewWrapper>Invalid Scripture block.</NodeViewWrapper>;
  return (
    <NodeViewWrapper>
      <ScriptureBlockContent
        block={parsed}
        editable={editor.isEditable}
        onChange={(next) => updateAttributes({ payload: JSON.stringify(next) })}
        provider={provider}
      />
    </NodeViewWrapper>
  );
}

export const createScriptureNodeViewRenderer = (
  provider: ScriptureProvider | undefined,
) =>
  ReactNodeViewRenderer((props) => (
    <ScriptureNodeView {...props} provider={provider} />
  ));
