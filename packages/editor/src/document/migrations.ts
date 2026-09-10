export type DocumentMigration = {
  readonly from: number;
  readonly to: number;
  readonly migrate: (input: unknown) => unknown;
};

export type MigrationResult = {
  readonly value: unknown;
  readonly applied: readonly string[];
};

export const documentV1ToV2Migration: DocumentMigration = {
  from: 1,
  to: 2,
  migrate(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('Invalid Canonical Document v1 input.');
    }
    return { ...input, version: 2 };
  },
};

function readVersion(input: unknown): number {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('version' in input) ||
    typeof input.version !== 'number' ||
    !Number.isInteger(input.version) ||
    input.version < 0
  ) {
    throw new Error('Document input does not contain a valid version.');
  }
  return input.version;
}

export function migrateDocument(
  input: unknown,
  targetVersion: number,
  migrations: readonly DocumentMigration[],
): MigrationResult {
  let version = readVersion(input);
  let value = input;
  const applied: string[] = [];
  const migrationByVersion = new Map<number, DocumentMigration>();

  for (const migration of migrations) {
    if (migration.to <= migration.from) {
      throw new Error(
        `Document migration ${migration.from}->${migration.to} must advance the version.`,
      );
    }
    if (migrationByVersion.has(migration.from)) {
      throw new Error(`Duplicate migration from version ${migration.from}.`);
    }
    migrationByVersion.set(migration.from, migration);
  }

  if (version > targetVersion) {
    throw new Error(
      `Document version ${version} is newer than supported version ${targetVersion}.`,
    );
  }

  while (version < targetVersion) {
    const migration = migrationByVersion.get(version);
    if (!migration) {
      throw new Error(`Missing document migration from version ${version}.`);
    }
    value = migration.migrate(value);
    const migratedVersion = readVersion(value);
    if (migratedVersion !== migration.to) {
      throw new Error(
        `Migration ${migration.from}->${migration.to} produced version ${migratedVersion}.`,
      );
    }
    applied.push(`${migration.from}->${migration.to}`);
    version = migratedVersion;
  }

  return { value, applied };
}
