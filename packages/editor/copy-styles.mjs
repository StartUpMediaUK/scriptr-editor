import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname);
copyFileSync(
  resolve(projectRoot, 'src/react/styles.css'),
  resolve(projectRoot, 'dist/styles.css'),
);
