import { useEffect, useState } from 'react';

import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
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

  const title =
    mode === 'scripture' ? 'Insert Scripture' : 'Insert translation comparison';
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      open
    >
      <DialogContent
        aria-label={title}
        className="scriptr-editor__inspector scriptr-editor__workflow-dialog--scripture"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {state.status === 'loading' ? (
          <p role="status">Loading Scripture data…</p>
        ) : state.status === 'error' ? (
          <div className="scriptr-editor__workflow-status" role="alert">
            <p>Scripture is unavailable right now.</p>
            <Button
              onClick={() => setAttempt((value) => value + 1)}
              size="sm"
              type="button"
            >
              Try again
            </Button>
            <Button
              onClick={onCancel}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        ) : state.translations.length < (mode === 'comparison' ? 2 : 1) ? (
          <div className="scriptr-editor__workflow-status" role="alert">
            <p>
              {mode === 'comparison'
                ? 'At least two translations are required.'
                : 'No Scripture translations are available.'}
            </p>
            <Button
              onClick={onCancel}
              size="sm"
              type="button"
              variant="outline"
            >
              Close
            </Button>
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
      </DialogContent>
    </Dialog>
  );
}
