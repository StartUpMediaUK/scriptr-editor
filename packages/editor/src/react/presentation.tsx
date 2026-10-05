import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  createPresentationController,
  type PresentationConfiguration,
  type PresentationController,
  type PresentationPreferencesInput,
  type ResolvedPresentation,
} from '../presentation/index.js';

const PresentationContext = createContext<PresentationController | undefined>(
  undefined,
);

export interface ScriptrPresentationProviderProps {
  readonly children: ReactNode;
  readonly configuration?: PresentationConfiguration;
  readonly controller?: PresentationController;
  readonly value?: PresentationPreferencesInput;
  readonly defaultValue?: PresentationPreferencesInput;
  readonly onChange?: (value: ResolvedPresentation['preferences']) => void;
}

export function ScriptrPresentationProvider({
  children,
  configuration,
  controller: externalController,
  value,
  defaultValue,
  onChange,
}: ScriptrPresentationProviderProps) {
  const internalController = useMemo(
    () => createPresentationController(configuration, value ?? defaultValue),
    [configuration, value],
  );
  const controller = externalController ?? internalController;

  useEffect(() => {
    if (value && externalController) externalController.replace(value);
  }, [externalController, value]);
  useEffect(
    () =>
      onChange && value === undefined
        ? controller.subscribe(() =>
            onChange(controller.getSnapshot().preferences),
          )
        : undefined,
    [controller, onChange, value],
  );

  const contextController = useMemo<PresentationController>(() => {
    if (value === undefined) return controller;
    const propose = (change: (proposal: PresentationController) => void) => {
      const proposal = createPresentationController(configuration, value);
      change(proposal);
      onChange?.(proposal.getSnapshot().preferences);
    };
    return {
      getSnapshot: () => controller.getSnapshot(),
      subscribe: (listener) => controller.subscribe(listener),
      update: (patch) => propose((proposal) => proposal.update(patch)),
      replace: (next) => propose((proposal) => proposal.replace(next)),
      reset: () => propose((proposal) => proposal.reset()),
    };
  }, [configuration, controller, onChange, value]);

  return (
    <PresentationContext.Provider value={contextController}>
      {children}
    </PresentationContext.Provider>
  );
}

export function useScriptrPresentation(): ResolvedPresentation & {
  readonly update: PresentationController['update'];
  readonly reset: PresentationController['reset'];
} {
  const controller = useContext(PresentationContext);
  if (!controller)
    throw new Error(
      'useScriptrPresentation must be used inside ScriptrPresentationProvider.',
    );
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
  return {
    ...snapshot,
    update: (patch) => controller.update(patch),
    reset: () => controller.reset(),
  };
}

export function ScriptrPresentationSurface({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const presentation = useScriptrPresentation();
  return (
    <div
      className={className}
      data-colour-scheme={presentation.preferences.colourScheme}
      data-scriptr-presentation=""
      style={presentation.cssVariables as CSSProperties}
    >
      {children}
    </div>
  );
}
