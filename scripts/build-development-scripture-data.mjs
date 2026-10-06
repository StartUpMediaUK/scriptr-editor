import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(
  repositoryRoot,
  'examples/vite-react/public/generated',
);

// Invented text exercises the local provider without redistributing translations.
const chapters = [
  ['GEN', 1, 31],
  ['PSA', 23, 6],
  ['JHN', 3, 36],
  ['ROM', 8, 39],
];
const translations = ['A', 'B', 'C'].map((sample) => {
  const books = {};
  for (const [book, chapter, verseCount] of chapters) {
    books[book] = {
      [chapter]: Object.fromEntries(
        Array.from({ length: verseCount }, (_, index) => [
          String(index + 1),
          `Sample ${sample}: synthetic development text for ${book} ${chapter}:${index + 1}. This is not a Bible translation.`,
        ]),
      ),
    };
  }
  return {
    id: `SAMPLE_${sample}`,
    name: `Sample ${sample} (synthetic)`,
    abbreviation: `SMP-${sample}`,
    languageTag: 'en',
    attribution: 'Scriptr Editor synthetic development fixture; not Scripture.',
    license: { name: 'MIT', attributionRequired: true },
    coverage: 'partial',
    books,
  };
});

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, 'scripture-dataset.json'),
  `${JSON.stringify({ version: 1, translations })}\n`,
);
await writeFile(
  resolve(outputDirectory, 'scripture-report.json'),
  `${JSON.stringify({ purpose: 'Synthetic development fixtures, not Bible translations', translations: translations.map(({ id }) => id), chapters }, null, 2)}\n`,
);
console.log(`Generated ${translations.length} synthetic development datasets.`);
