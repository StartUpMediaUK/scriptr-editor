import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

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
