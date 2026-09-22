import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(repositoryRoot, 'docs/bible-translations/csv');
const outputDirectory = resolve(
  repositoryRoot,
  'examples/vite-react/public/generated',
);

const canonicalBooks = [
  ['GEN', 'genesis'],
  ['EXO', 'exodus'],
  ['LEV', 'leviticus'],
  ['NUM', 'numbers'],
  ['DEU', 'deuteronomy'],
  ['JOS', 'joshua'],
  ['JDG', 'judges'],
  ['RUT', 'ruth'],
  ['1SA', '1-samuel'],
  ['2SA', '2-samuel'],
  ['1KI', '1-kings'],
  ['2KI', '2-kings'],
  ['1CH', '1-chronicles'],
  ['2CH', '2-chronicles'],
  ['EZR', 'ezra'],
  ['NEH', 'nehemiah'],
  ['EST', 'esther'],
  ['JOB', 'job'],
  ['PSA', 'psalms'],
  ['PRO', 'proverbs'],
  ['ECC', 'ecclesiastes'],
  ['SNG', 'song-of-solomon'],
  ['ISA', 'isaiah'],
  ['JER', 'jeremiah'],
  ['LAM', 'lamentations'],
  ['EZK', 'ezekiel'],
  ['DAN', 'daniel'],
  ['HOS', 'hosea'],
  ['JOL', 'joel'],
  ['AMO', 'amos'],
  ['OBA', 'obadiah'],
  ['JON', 'jonah'],
  ['MIC', 'micah'],
  ['NAM', 'nahum'],
  ['HAB', 'habakkuk'],
  ['ZEP', 'zephaniah'],
  ['HAG', 'haggai'],
  ['ZEC', 'zechariah'],
  ['MAL', 'malachi'],
  ['MAT', 'matthew'],
  ['MRK', 'mark'],
  ['LUK', 'luke'],
  ['JHN', 'john'],
  ['ACT', 'acts'],
  ['ROM', 'romans'],
  ['1CO', '1-corinthians'],
  ['2CO', '2-corinthians'],
  ['GAL', 'galatians'],
  ['EPH', 'ephesians'],
  ['PHP', 'philippians'],
  ['COL', 'colossians'],
  ['1TH', '1-thessalonians'],
  ['2TH', '2-thessalonians'],
  ['1TI', '1-timothy'],
  ['2TI', '2-timothy'],
  ['TIT', 'titus'],
  ['PHM', 'philemon'],
  ['HEB', 'hebrews'],
  ['JAS', 'james'],
  ['1PE', '1-peter'],
  ['2PE', '2-peter'],
  ['1JN', '1-john'],
  ['2JN', '2-john'],
  ['3JN', '3-john'],
  ['JUD', 'jude'],
  ['REV', 'revelation'],
];

const translations = [
  {
    file: 'kjv.csv',
    id: 'KJV',
    name: 'King James Version',
    abbreviation: 'KJV',
    languageTag: 'en',
    attribution: 'King James Version — Open Scriptorium development dataset',
    sourceWork: 'kjv',
  },
  {
    file: 'bsb.csv',
    id: 'BSB',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    languageTag: 'en',
    attribution: 'Berean Standard Bible — Open Scriptorium development dataset',
    sourceWork: 'bsb',
  },
  {
    file: 'web.csv',
    id: 'WEBBE',
    name: 'World English Bible British Edition',
    abbreviation: 'WEBBE',
    languageTag: 'en',
    attribution:
      'World English Bible British Edition — Open Scriptorium development dataset',
    sourceWork: 'webbe',
  },
];

const license = {
  name: 'Public Domain',
  url: 'https://creativecommons.org/share-your-work/public-domain/pdm/',
  attributionRequired: false,
};

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('CSV ended inside a quoted field.');
  return rows;
}

function convertTranslation(configuration, csv) {
  const rows = parseCsv(csv);
  const header = rows.shift();
  if (header?.join(',') !== 'book,chapter,verse,label,body') {
    throw new Error(`${configuration.file} has an unexpected header.`);
  }

  const bookIds = new Map(canonicalBooks.map(([id, slug]) => [slug, id]));
  const books = {};
  const extras = new Set();
  let acceptedVerses = 0;

  for (const [rowIndex, row] of rows.entries()) {
    if (row.length !== 5) {
      throw new Error(
        `${configuration.file}:${rowIndex + 2} has ${row.length} fields instead of 5.`,
      );
    }
    const [sourceBook, , , label, body] = row;
    const bookId = bookIds.get(sourceBook);
    if (!bookId) {
      extras.add(sourceBook);
      continue;
    }
    const reference = /^(\d+):(\d+)$/.exec(label);
    if (!reference) {
      throw new Error(
        `${configuration.file}:${rowIndex + 2} has invalid label "${label}".`,
      );
    }
    const [, chapter, verse] = reference;
    if (!body.trim()) {
      throw new Error(`${configuration.file}:${rowIndex + 2} has empty text.`);
    }
    books[bookId] ??= {};
    books[bookId][chapter] ??= {};
    if (books[bookId][chapter][verse]) {
      throw new Error(
        `${configuration.file}:${rowIndex + 2} duplicates ${bookId} ${label}.`,
      );
    }
    books[bookId][chapter][verse] = body.trim();
    acceptedVerses += 1;
  }

  const missingBooks = canonicalBooks
    .filter(([id]) => books[id] === undefined)
    .map(([id]) => id);
  if (missingBooks.length) {
    throw new Error(
      `${configuration.file} is missing canonical books: ${missingBooks.join(', ')}.`,
    );
  }

  const orderedBooks = Object.fromEntries(
    canonicalBooks.map(([id]) => [id, books[id]]),
  );
  return {
    translation: {
      id: configuration.id,
      name: configuration.name,
      abbreviation: configuration.abbreviation,
      languageTag: configuration.languageTag,
      attribution: configuration.attribution,
      license,
      coverage: 'complete',
      books: orderedBooks,
    },
    report: {
      id: configuration.id,
      sourceFile: configuration.file,
      sourceWork: configuration.sourceWork,
      acceptedBooks: canonicalBooks.length,
      acceptedVerses,
      excludedBooks: [...extras].sort(),
      warnings: [
        'Source row order was ignored; canonical package order was used.',
        'The source chapter field was ignored; chapter and verse were parsed from label.',
      ],
    },
  };
}

const converted = [];
for (const configuration of translations) {
  const csv = await readFile(
    resolve(sourceDirectory, configuration.file),
    'utf8',
  );
  converted.push(convertTranslation(configuration, csv));
}

const dataset = {
  version: 1,
  translations: converted.map(({ translation }) => translation),
};
const report = {
  purpose: 'Development-only Scriptr Editor Scripture fixtures',
  source: 'https://openscriptorium.org/downloads',
  canonicalOrder: canonicalBooks.map(([id]) => id),
  translations: converted.map(
    ({ report: translationReport }) => translationReport,
  ),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, 'scripture-dataset.json'),
  `${JSON.stringify(dataset)}\n`,
);
await writeFile(
  resolve(outputDirectory, 'scripture-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(
  `Generated ${dataset.translations.length} development translations in ${outputDirectory}.`,
);
