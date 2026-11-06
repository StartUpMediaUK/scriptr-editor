import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const projectRoot = resolve(import.meta.dirname);
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) throw new Error('pnpm did not provide its CLI path.');

execFileSync(
  process.execPath,
  [
    pnpmCli,
    'exec',
    'tailwindcss',
    '-i',
    resolve(projectRoot, 'src/styles/globals.css'),
    '-o',
    resolve(projectRoot, 'dist/styles.css'),
    '--minify',
  ],
  { cwd: projectRoot, stdio: 'inherit' },
);

// Tailwind emits theme defaults at :root even without preflight. Keep these
// defaults local so importing the editor does not redefine a host's UI tokens.
const outputPath = resolve(projectRoot, 'dist/styles.css');
const packageRoots =
  ':where(.scriptr-editor,.scriptr-renderer,.scriptr-scripture-picker,.scriptr-reference-editor,.scriptr-document-picker,[data-scriptr-presentation],[data-scriptr-ui])';
writeFileSync(
  outputPath,
  readFileSync(outputPath, 'utf8').replaceAll(':root,:host', packageRoots),
);
