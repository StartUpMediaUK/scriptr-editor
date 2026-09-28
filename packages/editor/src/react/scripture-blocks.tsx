import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Plus,
  RectangleHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '../components/ui/popover.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group.js';
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
import { ScriptureProviderError } from '../host/scripture.js';
import {
  formatScriptureAddress,
  parseReferenceQuery,
} from '../scripture/address.js';
import type { ScriptureStructure } from '../scripture/types.js';
import { ScripturePicker } from './scripture-picker.js';

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
  | {
      readonly state: 'offline' | 'unavailable';
      readonly message: string;
      readonly retryable: boolean;
    }
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
  const [attempt, setAttempt] = useState(0);
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
        retryable: false,
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
          state:
            error instanceof ScriptureProviderError &&
            error.reason === 'offline'
              ? 'offline'
              : 'unavailable',
          message:
            error instanceof Error ? error.message : 'Passage unavailable.',
          retryable:
            error instanceof ScriptureProviderError ? error.retryable : true,
        });
      },
    );
    return () => controller.abort();
  }, [address, attempt, provider, translation]);

  return (
    <div
      aria-busy={resolved.state === 'loading' || undefined}
      className="scriptr-scripture__passage"
      data-state={resolved.state}
    >
      <strong>{translation?.abbreviation ?? 'Translation'}</strong>
      {resolved.state === 'ready' ? (
        <>
          <p>
            {resolved.passage.verses?.length
              ? resolved.passage.verses.map((verse) => (
                  <span className="scriptr-scripture__verse" key={verse.number}>
                    <sup className="scriptr-scripture__verse-number">
                      {verse.number}
                    </sup>{' '}
                    {verse.text}{' '}
                  </span>
                ))
              : resolved.passage.text}
          </p>
          <small>{resolved.passage.attribution}</small>
        </>
      ) : (
        <div className="scriptr-scripture__passage-status">
          <p role="status">
            {resolved.state === 'loading'
              ? 'Loading passage…'
              : resolved.message}
          </p>
          {resolved.state !== 'loading' && resolved.retryable ? (
            <Button
              onClick={() => setAttempt((current) => current + 1)}
              size="sm"
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EditableAddress({
  address,
  structure,
  translationId,
  onCommit,
  onExit,
}: {
  readonly address: ScriptureAddress;
  readonly structure: ScriptureStructure;
  readonly translationId: string;
  readonly onCommit: (address: ScriptureAddress) => void;
  readonly onExit: () => void;
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
  const applyAddress = (nextAddress: ScriptureAddress) => {
    const nextBook = structure.books.find(
      (candidate) => candidate.id === nextAddress.book,
    );
    setBookText(
      nextBook?.translationNames?.[translationId] ??
        nextBook?.name ??
        nextAddress.book,
    );
    setChapterText(String(nextAddress.chapter));
    setVerseText(
      nextAddress.verseStart === undefined
        ? ''
        : `${nextAddress.verseStart}${nextAddress.verseEnd === undefined ? '' : `-${nextAddress.verseEnd}`}`,
    );
    onCommit(nextAddress);
  };
  return (
    <div
      aria-label="Scripture address"
      className="scriptr-scripture__address-editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          commit();
          onExit();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onExit();
      }}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData('text').trim();
        const result = parseReferenceQuery(pasted, structure);
        if (!result.address || result.error) return;
        event.preventDefault();
        applyAddress(result.address);
        verseRef.current?.focus();
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
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [addressInputOpen, setAddressInputOpen] = useState(false);
  const addressClickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(
    () => () => {
      if (addressClickTimer.current) clearTimeout(addressClickTimer.current);
    },
    [],
  );
  const translationIds =
    block.type === 'scripture' ? [block.translationId] : block.translationIds;
  const translationMap = useMemo(
    () =>
      new Map(translations.map((translation) => [translation.id, translation])),
    [translations],
  );
  const translationItems = useMemo(
    () =>
      translations.map((translation) => ({
        label: translation.abbreviation,
        value: translation.id,
      })),
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
          <>
            {addressInputOpen ? (
              <EditableAddress
                address={block.address}
                onCommit={(address) => onChange?.({ ...block, address })}
                onExit={() => setAddressInputOpen(false)}
                structure={structure}
                translationId={translationIds[0] ?? ''}
              />
            ) : (
              <Button
                aria-label={`Edit Scripture address ${label}`}
                className="scriptr-scripture__address-button"
                onClick={() => {
                  if (addressClickTimer.current)
                    clearTimeout(addressClickTimer.current);
                  addressClickTimer.current = setTimeout(
                    () => setAddressPickerOpen(true),
                    220,
                  );
                }}
                onDoubleClick={() => {
                  if (addressClickTimer.current)
                    clearTimeout(addressClickTimer.current);
                  setAddressPickerOpen(false);
                  setAddressInputOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                {label}
              </Button>
            )}
            <Dialog
              onOpenChange={setAddressPickerOpen}
              open={addressPickerOpen}
            >
              <DialogContent
                aria-label="Edit Scripture reference"
                className="scriptr-editor__inspector scriptr-editor__workflow-dialog--scripture"
                showCloseButton={false}
              >
                <DialogTitle className="sr-only">
                  Edit Scripture reference
                </DialogTitle>
                <ScripturePicker
                  actionLabel="Update reference"
                  className="scriptr-scripture-picker--dialog"
                  initialQuery={label}
                  onCancel={() => setAddressPickerOpen(false)}
                  onSelect={(address) => {
                    onChange?.({ ...block, address });
                    setAddressPickerOpen(false);
                  }}
                  structure={structure}
                  translationId={translationIds[0] ?? ''}
                />
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <span>{label}</span>
        )}
        {editable && translations.length ? (
          block.type === 'scripture' ? (
            <Select
              items={translationItems}
              value={block.translationId}
              onValueChange={(translationId) => {
                if (
                  translationId === null ||
                  translationId === block.translationId
                )
                  return;
                onChange?.({ ...block, translationId });
              }}
            >
              <SelectTrigger aria-label="Scripture translation" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {translations.map((translation) => (
                    <SelectItem key={translation.id} value={translation.id}>
                      {translation.abbreviation}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <div className="scriptr-editor__context-toolbar scriptr-scripture__layout">
              <ToggleGroup
                aria-label="Scripture comparison layout"
                onValueChange={(layouts) => {
                  const layout = layouts[0];
                  if (layout === 'oneColumn' || layout === 'twoColumn') {
                    onChange?.({ ...block, layout });
                  }
                }}
                size="icon"
                value={[block.layout]}
              >
                <ToggleGroupItem aria-label="One column" value="oneColumn">
                  <RectangleHorizontal />
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Two columns" value="twoColumn">
                  <Columns2 />
                </ToggleGroupItem>
              </ToggleGroup>
              <Popover
                onOpenChange={setTranslationMenuOpen}
                open={translationMenuOpen}
              >
                <PopoverTrigger
                  render={
                    <Button
                      aria-label="Add translation"
                      disabled={translationIds.length === translations.length}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <Plus />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="scriptr-scripture__translation-menu"
                >
                  <PopoverTitle className="sr-only">
                    Add translation
                  </PopoverTitle>
                  {translations
                    .filter(
                      (translation) => !translationIds.includes(translation.id),
                    )
                    .map((translation) => (
                      <Button
                        key={translation.id}
                        onClick={() => {
                          replaceTranslations([
                            ...translationIds,
                            translation.id,
                          ]);
                          setTranslationMenuOpen(false);
                        }}
                        role="menuitem"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {translation.name}
                      </Button>
                    ))}
                </PopoverContent>
              </Popover>
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
                <Button
                  aria-label={`Move ${translationId} earlier`}
                  disabled={index === 0}
                  onClick={() =>
                    replaceTranslations(
                      moveTranslation(translationIds, index, index - 1),
                    )
                  }
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUp />
                </Button>
                <Button
                  aria-label={`Move ${translationId} later`}
                  disabled={index === translationIds.length - 1}
                  onClick={() =>
                    replaceTranslations(
                      moveTranslation(translationIds, index, index + 1),
                    )
                  }
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDown />
                </Button>
                <Button
                  aria-label={`Remove ${translationId}`}
                  disabled={translationIds.length === 1}
                  onClick={() =>
                    replaceTranslations(
                      translationIds.filter((id) => id !== translationId),
                    )
                  }
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
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
