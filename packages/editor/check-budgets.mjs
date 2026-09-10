import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, 'dist');
const files = readdirSync(dist, { recursive: true }).map(String);
const bytes = (suffix) =>
  files
    .filter((file) => file.endsWith(suffix))
    .reduce((total, file) => total + statSync(join(dist, file)).size, 0);
const budgets = { '.js': 900_000, '.css': 60_000 };
for (const [suffix, limit] of Object.entries(budgets)) {
  const size = bytes(suffix);
  if (size > limit)
    throw new Error(`${suffix} output is ${size} bytes; budget is ${limit}.`);
  console.log(`${suffix} output: ${size}/${limit} bytes`);
}
