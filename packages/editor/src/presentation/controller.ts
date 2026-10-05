import type {
  FontDefinition,
  PresentationConfiguration,
  PresentationController,
  PresentationPreferencesInput,
  RegistryInput,
  ResolvedPresentation,
  ThemeDefinition,
  TypographySettings,
} from './types.js';

export const builtInFonts = [
  {
    id: 'system-sans',
    label: 'System Sans',
    family: 'ui-sans-serif, system-ui, sans-serif',
    kind: 'sans',
  },
  {
    id: 'system-serif',
    label: 'System Serif',
    family: 'ui-serif, Georgia, serif',
    kind: 'serif',
  },
  {
    id: 'geist',
    label: 'Geist',
    family: 'Geist, ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter, ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    family: 'Roboto, ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    family: '"Open Sans", ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    family: 'Montserrat, ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    family: 'Poppins, ui-sans-serif, sans-serif',
    kind: 'sans',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    family: 'Merriweather, ui-serif, serif',
    kind: 'serif',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    family: '"Playfair Display", ui-serif, serif',
    kind: 'serif',
  },
] as const satisfies readonly FontDefinition[];

const serifTypography: TypographySettings = {
  heading: { fontId: 'system-serif', size: 36 },
  body: { fontId: 'system-serif', size: 18 },
  accent: { fontId: 'playfair-display', size: 18 },
  reference: { fontId: 'system-serif', size: 16 },
};

export const builtInThemes = [
  { id: 'classic-serif', label: 'Classic Serif', typography: serifTypography },
  {
    id: 'modern-sans',
    label: 'Modern Sans',
    typography: {
      heading: { fontId: 'system-sans', size: 36 },
      body: { fontId: 'system-sans', size: 18 },
      accent: { fontId: 'playfair-display', size: 18 },
      reference: { fontId: 'system-sans', size: 16 },
    },
  },
] as const satisfies readonly ThemeDefinition[];

function mergeRegistry<T extends { readonly id: string }>(
  builtIns: readonly T[],
  input?: RegistryInput<T>,
): readonly T[] {
  const source = input?.replace ?? builtIns;
  const result = new Map(source.map((item) => [item.id, item]));
  for (const item of input?.extend ?? []) result.set(item.id, item);
  return [...result.values()];
}

function clampContrast(value: number | undefined): number {
  return Math.min(150, Math.max(50, value ?? 100));
}

function resolve(
  config: PresentationConfiguration,
  user: PresentationPreferencesInput,
): ResolvedPresentation {
  const fonts = mergeRegistry(builtInFonts, config.fonts);
  const themes = mergeRegistry(builtInThemes, config.themes);
  if (fonts.length === 0 || themes.length === 0)
    throw new Error('Presentation registries cannot be empty.');
  const themeId = user.themeId ?? config.defaults?.themeId ?? themes[0]!.id;
  const theme =
    themes.find((candidate) => candidate.id === themeId) ?? themes[0]!;
  const typography = {
    ...theme.typography,
    ...config.defaults?.typography,
    ...user.typography,
  };
  const fontFamily = (id: string) =>
    fonts.find((font) => font.id === id)?.family ?? fonts[0]!.family;
  const preferences = {
    version: 1 as const,
    timeFormat:
      user.timeFormat ?? config.defaults?.timeFormat ?? ('system' as const),
    colourScheme:
      user.colourScheme ?? config.defaults?.colourScheme ?? ('system' as const),
    contrast: clampContrast(user.contrast ?? config.defaults?.contrast),
    themeId: theme.id,
    typography,
  };
  return {
    preferences,
    fonts,
    themes,
    cssVariables: {
      '--scriptr-font-heading': fontFamily(typography.heading.fontId),
      '--scriptr-font-body': fontFamily(typography.body.fontId),
      '--scriptr-font-accent': fontFamily(typography.accent.fontId),
      '--scriptr-font-reference': fontFamily(typography.reference.fontId),
      '--scriptr-size-heading': `${typography.heading.size}px`,
      '--scriptr-size-body': `${typography.body.size}px`,
      '--scriptr-size-accent': `${typography.accent.size}px`,
      '--scriptr-size-reference': `${typography.reference.size}px`,
      '--scriptr-contrast': `${preferences.contrast}%`,
    },
  };
}

export function createPresentationController(
  configuration: PresentationConfiguration = {},
  initial: PresentationPreferencesInput = {},
): PresentationController {
  let user = initial;
  let snapshot = resolve(configuration, user);
  const listeners = new Set<() => void>();
  const commit = (next: PresentationPreferencesInput) => {
    user = next;
    snapshot = resolve(configuration, user);
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    update: (patch) =>
      commit({
        ...user,
        ...patch,
        typography: {
          ...(patch.themeId !== undefined &&
          patch.themeId !== snapshot.preferences.themeId
            ? {}
            : user.typography),
          ...patch.typography,
        },
      }),
    replace: commit,
    reset: () => commit({}),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
