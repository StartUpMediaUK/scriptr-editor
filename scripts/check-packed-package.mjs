import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'scriptr-editor-pack-'));

try {
  const packageOutput = execFileSync(
    'pnpm',
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
    .split('\n');
  const requiredFiles = [
    'package/LICENSE',
    'package/README.md',
    'package/dist/index.d.ts',
    'package/dist/index.js',
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
  execFileSync('mkdir', ['-p', fixtureDirectory]);
  writeFileSync(
    join(fixtureDirectory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  execFileSync('npm', ['install', '--ignore-scripts', tarballPath], {
    cwd: fixtureDirectory,
    stdio: 'inherit',
  });
  const importedName = execFileSync(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { PACKAGE_NAME } from 'scriptr-editor'; process.stdout.write(PACKAGE_NAME);",
    ],
    { cwd: fixtureDirectory, encoding: 'utf8' },
  );

  if (importedName !== 'scriptr-editor') {
    throw new Error(`Unexpected package import result: ${importedName}`);
  }

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
