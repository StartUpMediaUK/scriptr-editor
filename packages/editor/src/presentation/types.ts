export type TimeFormat = 'system' | '12-hour' | '24-hour';
export type ColourScheme = 'system' | 'light' | 'dark';
export type FontKind = 'sans' | 'serif';
export type TypographyRole = 'heading' | 'body' | 'accent' | 'reference';

export interface FontDefinition {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly kind: FontKind;
}

export interface TypographySetting {
  readonly fontId: string;
  readonly size: number;
}

export type TypographySettings = Readonly<
  Record<TypographyRole, TypographySetting>
>;

export interface ThemeDefinition {
  readonly id: string;
  readonly label: string;
  readonly typography: TypographySettings;
}

export interface RegistryInput<T> {
  readonly extend?: readonly T[];
  readonly replace?: readonly T[];
}

export interface PresentationPreferences {
  readonly version: 1;
  readonly timeFormat?: TimeFormat;
  readonly colourScheme?: ColourScheme;
  readonly contrast?: number;
  readonly themeId?: string;
  readonly typography?: Partial<TypographySettings>;
}

export type PresentationPreferencesInput = Omit<
  PresentationPreferences,
  'version'
>;

export interface PresentationConfiguration {
  readonly defaults?: PresentationPreferencesInput;
  readonly fonts?: RegistryInput<FontDefinition>;
  readonly themes?: RegistryInput<ThemeDefinition>;
}

export interface ResolvedPresentation {
  readonly preferences: Required<
    Omit<PresentationPreferences, 'typography'>
  > & { readonly typography: TypographySettings };
  readonly fonts: readonly FontDefinition[];
  readonly themes: readonly ThemeDefinition[];
  readonly cssVariables: Readonly<Record<string, string>>;
}

export interface PresentationController {
  getSnapshot(): ResolvedPresentation;
  update(patch: PresentationPreferencesInput): void;
  replace(preferences: PresentationPreferencesInput): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}
