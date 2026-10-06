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
const runtimePaths = [process.execPath];
for (let index = 2; index < process.argv.length; index += 2) {
  if (process.argv[index] !== '--runtime' || !process.argv[index + 1])
    throw new Error(
      'Use --runtime followed by an absolute Node executable path.',
    );
  runtimePaths.push(resolve(process.argv[index + 1]));
}

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

  if (
    contents.some((file) =>
      /package\/dist\/components\/ui\/(message-scroller|questionnaire)\./.test(
        file,
      ),
    )
  )
    throw new Error(
      'Development-only React 19 UI modules leaked into the runtime artifact.',
    );

  const fixtureDirectory = join(temporaryDirectory, 'fixture');
  mkdirSync(fixtureDirectory);
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  runPnpm(
    [
      'install',
      '--ignore-scripts',
      '--strict-peer-dependencies',
      tarballPath,
      'react@18.3.1',
      'react-dom@18.3.1',
    ],
    {
      cwd: fixtureDirectory,
      stdio: 'inherit',
    },
  );
  const importedName = execFileSync(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { PACKAGE_NAME, defineScriptr } from '@startupmedia/scriptr-editor'; import { createCommandCatalogue } from '@startupmedia/scriptr-editor/commands'; import { DOCUMENT_VERSION } from '@startupmedia/scriptr-editor/document'; import { defineExtension } from '@startupmedia/scriptr-editor/extensions'; import { BookmarkComposer, MediaUploader, ScriptrRenderer } from '@startupmedia/scriptr-editor/react'; import { parseReferenceQuery } from '@startupmedia/scriptr-editor/scripture'; import { createScriptrServer } from '@startupmedia/scriptr-editor/server'; await import('@startupmedia/scriptr-editor/host'); process.stdout.write(`${PACKAGE_NAME}:${DOCUMENT_VERSION}:${typeof defineScriptr}:${typeof createCommandCatalogue}:${typeof defineExtension}:${typeof ScriptrRenderer}:${typeof MediaUploader}:${typeof BookmarkComposer}:${typeof parseReferenceQuery}:${typeof createScriptrServer}`);",
    ],
    { cwd: fixtureDirectory, encoding: 'utf8' },
  );

  if (
    importedName !==
    '@startupmedia/scriptr-editor:2:function:function:function:function:function:function:function:function'
  ) {
    throw new Error(`Unexpected package import result: ${importedName}`);
  }

  writeFileSync(
    join(fixtureDirectory, 'consumer.ts'),
    "import { defineScriptr } from '@startupmedia/scriptr-editor';\nimport type { CanonicalDocument, ScriptureProvider } from '@startupmedia/scriptr-editor';\nimport type { BookmarkProvider, MediaHost } from '@startupmedia/scriptr-editor/host';\nimport type { ScriptrEditorHandle } from '@startupmedia/scriptr-editor/react';\nimport { createScriptrServer } from '@startupmedia/scriptr-editor/server';\nconst document: CanonicalDocument = { version: 2, content: [] };\nconst provider: ScriptureProvider | undefined = undefined;\nconst media: MediaHost | undefined = undefined;\nconst bookmarks: BookmarkProvider | undefined = undefined;\nconst handle: ScriptrEditorHandle | undefined = undefined;\nconst client = defineScriptr();\nconst server = createScriptrServer({});\nvoid [document, provider, media, bookmarks, handle, client, server];\n",
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
    join(
      fixtureDirectory,
      'node_modules/@startupmedia/scriptr-editor/dist/index.d.ts',
    ),
    'utf8',
  );

  if (!installedDeclaration.includes('PACKAGE_NAME')) {
    throw new Error(
      'Installed package does not contain expected declarations.',
    );
  }

  const smoke = `
    import assert from 'node:assert/strict';
    import { createElement, StrictMode } from 'react';
    import { renderToString } from 'react-dom/server';
    import { ScriptrEditor, ScriptrRenderer } from '@startupmedia/scriptr-editor/react';
    import { createDocumentCodec } from '@startupmedia/scriptr-editor/document';
    import { createLocalScriptureProvider, parseLocalScriptureDataset } from '@startupmedia/scriptr-editor/scripture';
    const document = createDocumentCodec().parse({ version: 2, content: [{ id: 'p', type: 'paragraph', content: [{ type: 'text', text: 'Packed consumer text' }] }] });
    assert.match(renderToString(createElement(StrictMode, null, createElement(ScriptrRenderer, { document }))), /Packed consumer text/);
    assert.equal(typeof renderToString(createElement(StrictMode, null, createElement(ScriptrEditor, { defaultValue: document }))), 'string');
    const provider = createLocalScriptureProvider(parseLocalScriptureDataset({ version: 1, translations: [{ id: 'fixture', name: 'Fixture', abbreviation: 'F', languageTag: 'en', attribution: 'Fixture', coverage: 'partial', books: { GEN: { '1': { '1': 'Packed fixture verse' } } } }] }));
    assert.equal((await provider.getPassage({ book: 'GEN', chapter: 1, verseStart: 1 }, 'fixture')).text, 'Packed fixture verse');
    process.stdout.write(process.version);
  `;
  for (const reactVersion of ['18.3.1', '19.3.0']) {
    if (reactVersion !== '18.3.1')
      runPnpm(
        [
          'add',
          '--ignore-scripts',
          '--strict-peer-dependencies',
          `react@${reactVersion}`,
          `react-dom@${reactVersion}`,
        ],
        {
          cwd: fixtureDirectory,
          stdio: 'inherit',
        },
      );
    for (const runtimePath of new Set(runtimePaths)) {
      const version = execFileSync(
        runtimePath,
        ['--input-type=module', '--eval', smoke],
        {
          cwd: fixtureDirectory,
          encoding: 'utf8',
        },
      );
      console.log(
        `Packed SSR/provider smoke passed: Node ${version}, React ${reactVersion}.`,
      );
    }
  }

  const archives = readdirSync(temporaryDirectory).filter((file) =>
    file.endsWith('.tgz'),
  );
  console.log(`Validated packed artifact: ${archives.join(', ')}`);
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
