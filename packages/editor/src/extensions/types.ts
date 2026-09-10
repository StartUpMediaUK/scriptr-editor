import type { z } from 'zod';

import type { ExtensionBlock, JsonValue } from '../document/types.js';

export type ExtensionDataMigration = {
  readonly from: number;
  readonly to: number;
  readonly migrate: (data: JsonValue) => JsonValue;
};

export type ExtensionRenderContext = {
  readonly locale?: string | undefined;
};

export type ExtensionDefinition<
  TData extends JsonValue = JsonValue,
  TEditableOutput = unknown,
  TReadonlyOutput = unknown,
> = {
  readonly name: string;
  readonly version: number;
  readonly dataSchema: z.ZodType<TData>;
  readonly migrations?: readonly ExtensionDataMigration[] | undefined;
  readonly renderEditable: (
    data: TData,
    context: ExtensionRenderContext,
  ) => TEditableOutput;
  readonly renderReadonly: (
    data: TData,
    context: ExtensionRenderContext,
  ) => TReadonlyOutput;
};

export type ExtensionRegistration = {
  readonly name: string;
  readonly version: number;
  readonly migrations?: readonly ExtensionDataMigration[] | undefined;
  readonly parseData: (input: unknown) => JsonValue;
};

export type DefinedExtension<
  TData extends JsonValue,
  TEditableOutput,
  TReadonlyOutput,
> = ExtensionDefinition<TData, TEditableOutput, TReadonlyOutput> &
  ExtensionRegistration;

export type RegisteredExtensionBlock = ExtensionBlock & {
  readonly registered: true;
};

export function defineExtension<
  TData extends JsonValue,
  TEditableOutput,
  TReadonlyOutput,
>(
  definition: ExtensionDefinition<TData, TEditableOutput, TReadonlyOutput>,
): DefinedExtension<TData, TEditableOutput, TReadonlyOutput> {
  return {
    ...definition,
    parseData(input) {
      return definition.dataSchema.parse(input);
    },
  };
}
