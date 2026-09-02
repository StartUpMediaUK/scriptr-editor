import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createExtensionRegistry } from './registry.js';
import { defineExtension } from './types.js';

const extension = defineExtension({
  name: 'uk.startupmedia.fixture',
  version: 2,
  dataSchema: z.object({ message: z.string() }),
  migrations: [{ from: 1, to: 2, migrate: () => ({ message: 'migrated' }) }],
  renderEditable: (data) => data.message,
  renderReadonly: (data) => data.message,
});

describe('extension registry', () => {
  it('migrates, validates and retrieves a registered extension', () => {
    const registry = createExtensionRegistry([extension]);
    expect(registry.get(extension.name)).toBe(extension);
    expect(
      registry.validate({
        id: 'x',
        type: 'extension',
        name: extension.name,
        version: 1,
        data: {},
      }),
    ).toMatchObject({ version: 2, data: { message: 'migrated' } });
  });

  it('rejects ambiguous migration routes', () => {
    expect(() =>
      createExtensionRegistry([
        {
          ...extension,
          migrations: [
            { from: 1, to: 2, migrate: (data) => data },
            { from: 1, to: 3, migrate: (data) => data },
          ],
        },
      ]),
    ).toThrow('Ambiguous');
  });
});
