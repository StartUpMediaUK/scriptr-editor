import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';

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
import { formatScriptureAddress } from '../scripture/address.js';
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

export function ScriptureBlockContent({
  block,
  provider,
  editable = false,
  onChange,
}: ScriptureBlockContentProps) {
  const { structure, translations } = useProviderMetadata(provider);
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
        <span>{label}</span>
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
                aria-pressed={block.layout === 'oneColumn'}
                onClick={() => onChange?.({ ...block, layout: 'oneColumn' })}
                type="button"
              >
                One column
              </button>
              <button
                aria-pressed={block.layout === 'twoColumn'}
                onClick={() => onChange?.({ ...block, layout: 'twoColumn' })}
                type="button"
              >
                Two columns
              </button>
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
      {editable && block.type === 'translationComparison' ? (
        <select
          aria-label="Add comparison translation"
          value=""
          onChange={(event) => {
            const id = event.currentTarget.value;
            if (id && !translationIds.includes(id))
              replaceTranslations([...translationIds, id]);
          }}
        >
          <option value="">Add translation…</option>
          {translations
            .filter((translation) => !translationIds.includes(translation.id))
            .map((translation) => (
              <option key={translation.id} value={translation.id}>
                {translation.name}
              </option>
            ))}
        </select>
      ) : null}
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
    version: 1,
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
