import { useEffect, useState } from 'react';

import type { ScriptureAddress } from '../document/types.js';
import type {
  ScriptureProvider,
  ScriptureTranslation,
} from '../host/scripture.js';
import type { ScriptureStructure } from '../scripture/types.js';
import { ScripturePicker } from './scripture-picker.js';

export type ScriptureCommandDialogProps = {
  readonly mode: 'scripture' | 'comparison';
  readonly provider: ScriptureProvider;
  readonly onSelect: (
    address: ScriptureAddress,
    translationIds: readonly string[],
  ) => void;
  readonly onCancel: () => void;
};

export function ScriptureCommandDialog({
  mode,
  provider,
  onSelect,
  onCancel,
}: ScriptureCommandDialogProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    | { readonly status: 'loading' }
    | { readonly status: 'error' }
    | {
        readonly status: 'ready';
        readonly structure: ScriptureStructure;
        readonly translations: readonly ScriptureTranslation[];
      }
  >({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    void Promise.all([
      provider.getStructure(controller.signal),
      provider.listTranslations(controller.signal),
    ]).then(
      ([structure, translations]) =>
        setState({ status: 'ready', structure, translations }),
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [attempt, provider]);

  return (
    <div
      aria-label={
        mode === 'scripture'
          ? 'Insert Scripture'
          : 'Insert translation comparison'
      }
      aria-modal="true"
      className="scriptr-editor__workflow-dialog"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
      role="dialog"
    >
      {state.status === 'loading' ? (
        <p role="status">Loading Scripture data…</p>
      ) : state.status === 'error' ? (
        <div className="scriptr-editor__workflow-status" role="alert">
          <p>Scripture is unavailable right now.</p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            Try again
          </button>
          <button onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      ) : state.translations.length < (mode === 'comparison' ? 2 : 1) ? (
        <div className="scriptr-editor__workflow-status" role="alert">
          <p>
            {mode === 'comparison'
              ? 'At least two translations are required.'
              : 'No Scripture translations are available.'}
          </p>
          <button onClick={onCancel} type="button">
            Close
          </button>
        </div>
      ) : (
        <ScripturePicker
          onCancel={onCancel}
          onSelect={(address) =>
            onSelect(
              address,
              state.translations
                .slice(0, mode === 'comparison' ? 2 : 1)
                .map((translation) => translation.id),
            )
          }
          structure={state.structure}
          translationId={state.translations[0]?.id}
        />
      )}
    </div>
  );
}
