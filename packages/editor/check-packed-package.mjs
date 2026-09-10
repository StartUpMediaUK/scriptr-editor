import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname);
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'scriptr-editor-pack-'));
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('pnpm did not provide its CLI path to the package check.');
}

const runPnpm = (arguments_, options) =>
  execFileSync(process.execPath, [pnpmCli, ...arguments_], options);

try {
  const packageOutput = runPnpm(
    ['pack', '--pack-destination', temporaryDirectory],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const archiveName = packageOutput.trim().split('\n').at(-1);

  if (!archiveName) {
    throw new Error('pnpm pack did not report an archive.');
  }

  const archivePath = resolve(projectRoot, archiveName);
  const tarballPath = archivePath.startsWith(temporaryDirectory)
    ? archivePath
    : join(temporaryDirectory, archiveName.split('/').at(-1));
  const contents = execFileSync('tar', ['-tzf', tarballPath], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((file) => file.trim());
  const requiredFiles = [
    'package/LICENSE',
    'package/README.md',
    'package/dist/commands/index.d.ts',
    'package/dist/commands/index.js',
    'package/dist/document/index.d.ts',
    'package/dist/document/index.js',
    'package/dist/extensions/index.d.ts',
    'package/dist/extensions/index.js',
    'package/dist/host/index.d.ts',
    'package/dist/host/index.js',
    'package/dist/index.d.ts',
    'package/dist/index.js',
    'package/dist/react/index.d.ts',
    'package/dist/react/index.js',
    'package/dist/scripture/index.d.ts',
    'package/dist/scripture/index.js',
    'package/dist/server.d.ts',
    'package/dist/server.js',
    'package/dist/styles.css',
    'package/package.json',
  ];

  for (const requiredFile of requiredFiles) {
    if (!contents.includes(requiredFile)) {
      throw new Error(`Packed package is missing ${requiredFile}.`);
    }
  }

  const forbiddenPrefixes = ['package/dev/', 'package/docs/', 'package/src/'];
  const forbiddenFile = contents.find((file) =>
    forbiddenPrefixes.some((prefix) => file.startsWith(prefix)),
  );

  if (forbiddenFile) {
    throw new Error(
      `Packed package contains forbidden source: ${forbiddenFile}`,
    );
  }

  const fixtureDirectory = join(temporaryDirectory, 'fixture');
  mkdirSync(fixtureDirectory);
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  runPnpm(['install', '--ignore-scripts', tarballPath], {
    cwd: fixtureDirectory,
    stdio: 'inherit',
  });
  const importedName = execFileSync(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { PACKAGE_NAME, defineScriptr } from 'scriptr-editor'; import { createCommandCatalogue } from 'scriptr-editor/commands'; import { DOCUMENT_VERSION } from 'scriptr-editor/document'; import { defineExtension } from 'scriptr-editor/extensions'; import { ScriptrRenderer } from 'scriptr-editor/react'; import { parseReferenceQuery } from 'scriptr-editor/scripture'; import { createScriptrServer } from 'scriptr-editor/server'; await import('scriptr-editor/host'); process.stdout.write(`${PACKAGE_NAME}:${DOCUMENT_VERSION}:${typeof defineScriptr}:${typeof createCommandCatalogue}:${typeof defineExtension}:${typeof ScriptrRenderer}:${typeof parseReferenceQuery}:${typeof createScriptrServer}`);",
    ],
    { cwd: fixtureDirectory, encoding: 'utf8' },
  );

  if (
    importedName !==
    'scriptr-editor:2:function:function:function:function:function:function'
  ) {
    throw new Error(`Unexpected package import result: ${importedName}`);
  }

  writeFileSync(
    join(fixtureDirectory, 'consumer.ts'),
    "import { defineScriptr } from 'scriptr-editor';\nimport type { CanonicalDocument, ScriptureProvider } from 'scriptr-editor';\nimport type { ScriptrEditorHandle } from 'scriptr-editor/react';\nimport { createScriptrServer } from 'scriptr-editor/server';\nconst document: CanonicalDocument = { version: 2, content: [] };\nconst provider: ScriptureProvider | undefined = undefined;\nconst handle: ScriptrEditorHandle | undefined = undefined;\nconst client = defineScriptr();\nconst server = createScriptrServer({});\nvoid [document, provider, handle, client, server];\n",
  );
  writeFileSync(
    join(fixtureDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      files: ['consumer.ts'],
    }),
  );
  runPnpm(['exec', 'tsc', '-p', join(fixtureDirectory, 'tsconfig.json')], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  const installedDeclaration = readFileSync(
    join(fixtureDirectory, 'node_modules/scriptr-editor/dist/index.d.ts'),
    'utf8',
  );

  if (!installedDeclaration.includes('PACKAGE_NAME')) {
    throw new Error(
      'Installed package does not contain expected declarations.',
    );
  }

  const archives = readdirSync(temporaryDirectory).filter((file) =>
    file.endsWith('.tgz'),
  );
  console.log(`Validated packed artifact: ${archives.join(', ')}`);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
