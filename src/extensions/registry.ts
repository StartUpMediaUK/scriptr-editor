import { z } from 'zod';

import type { ExtensionBlock, JsonValue } from '../document/types.js';
import type { ExtensionRegistration } from './types.js';

const extensionDefinitionSchema = z
  .object({
    name: z.string().trim().min(1),
    version: z.number().int().positive(),
  })
  .passthrough();

export type ExtensionRegistry = {
  readonly names: readonly string[];
  readonly validate: (block: ExtensionBlock) => ExtensionBlock;
  readonly get: (name: string) => ExtensionRegistration | undefined;
};

export function createExtensionRegistry(
  definitions: readonly ExtensionRegistration[],
): ExtensionRegistry {
  const byName = new Map<string, ExtensionRegistration>();

  for (const definition of definitions) {
    extensionDefinitionSchema.parse(definition);
    if (byName.has(definition.name)) {
      throw new Error(`Duplicate extension definition: ${definition.name}`);
    }
    const routes = new Set<number>();
    for (const migration of definition.migrations ?? []) {
      if (routes.has(migration.from))
        throw new Error(
          `Ambiguous extension migration for ${definition.name} version ${migration.from}.`,
        );
      if (migration.to <= migration.from)
        throw new Error(`Invalid extension migration for ${definition.name}.`);
      routes.add(migration.from);
    }
    byName.set(definition.name, definition);
  }

  return {
    names: [...byName.keys()].sort(),
    get: (name) => byName.get(name),
    validate(block) {
      const definition = byName.get(block.name);
      if (!definition) return block;

      let version = block.version;
      let data: JsonValue = block.data;
      const migrations = definition.migrations ?? [];

      while (version < definition.version) {
        const migration = migrations.find(
          (candidate) => candidate.from === version,
        );
        if (!migration || migration.to <= version) {
          throw new Error(
            `Missing extension migration for ${block.name} version ${version}.`,
          );
        }
        data = migration.migrate(data);
        version = migration.to;
      }

      if (version !== definition.version) {
        throw new Error(
          `Unsupported ${block.name} extension version ${version}; expected ${definition.version}.`,
        );
      }

      return {
        ...block,
        data: definition.parseData(data),
        version,
      };
    },
  };
}
