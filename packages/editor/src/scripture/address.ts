import type { ScriptureAddress } from '../document/types.js';
import type {
  AddressValidation,
  ReferenceQueryResult,
  ScriptureBookStructure,
  ScriptureStructure,
} from './types.js';

const normalize = (value: string) =>
  value.toLocaleLowerCase().replaceAll(/[^a-z0-9]/g, '');

function bookNames(book: ScriptureBookStructure) {
  return [book.id, book.name, ...book.aliases];
}

function exactBook(
  query: string,
  structure: ScriptureStructure,
): ScriptureBookStructure | undefined {
  const normalizedQuery = normalize(query);
  return structure.books.find((book) =>
    bookNames(book).some((name) => normalize(name) === normalizedQuery),
  );
}

export function findScriptureBooks(
  query: string,
  structure: ScriptureStructure,
): readonly ScriptureBookStructure[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return structure.books;
  return structure.books.filter((book) =>
    bookNames(book).some((name) => normalize(name).includes(normalizedQuery)),
  );
}

export function validateScriptureStructure(structure: ScriptureStructure) {
  const ids = new Set<string>();
  for (const book of structure.books) {
    if (ids.has(book.id))
      throw new Error(`Duplicate Scripture book: ${book.id}`);
    ids.add(book.id);
    if (!book.name.trim()) throw new Error(`Book ${book.id} has no name.`);
    if (!book.chapters.length || book.chapters.some((count) => count < 1)) {
      throw new Error(`Book ${book.id} has invalid chapter verse counts.`);
    }
  }
  return structure;
}

export function validateScriptureAddress(
  address: ScriptureAddress,
  structure: ScriptureStructure,
): AddressValidation {
  const book = structure.books.find(
    (candidate) => candidate.id === address.book,
  );
  if (!book) return { valid: false, reason: 'Choose a recognised Bible book.' };
  const verseCount = book.chapters[address.chapter - 1];
  if (!verseCount) return { valid: false, reason: 'Choose a valid chapter.' };
  if (address.verseStart === undefined) return { valid: true, address };
  if (address.verseStart < 1 || address.verseStart > verseCount) {
    return {
      valid: false,
      reason: `Cannot select this verse range. There is no available ${book.name} ${address.chapter}:${address.verseStart}.`,
    };
  }
  if (
    address.verseEnd !== undefined &&
    (address.verseEnd < address.verseStart || address.verseEnd > verseCount)
  ) {
    return {
      valid: false,
      reason: `Cannot select this verse range. There is no available ${book.name} ${address.chapter}:${address.verseEnd}.`,
    };
  }
  return { valid: true, address };
}

export function formatScriptureAddress(
  address: ScriptureAddress,
  structure: ScriptureStructure,
) {
  const book = structure.books.find(
    (candidate) => candidate.id === address.book,
  );
  const name = book?.name ?? address.book;
  if (address.verseStart === undefined) return `${name} ${address.chapter}`;
  const range =
    address.verseEnd === undefined || address.verseEnd === address.verseStart
      ? `${address.verseStart}`
      : `${address.verseStart}-${address.verseEnd}`;
  return `${name} ${address.chapter}:${range}`;
}

export function parseReferenceQuery(
  input: string,
  structure: ScriptureStructure,
): ReferenceQueryResult {
  const query = input.trim();
  const match = /^(.+?)(?:\s+(\d+)(?::(\d+)(?:-(\d+))?)?)?$/.exec(query);
  if (!match) return { query, stage: 'book', books: [] };
  const [, bookQuery = '', chapterText, verseStartText, verseEndText] = match;
  const books = findScriptureBooks(bookQuery, structure);
  const book =
    exactBook(bookQuery, structure) ??
    (books.length === 1 ? books[0] : undefined);
  if (!book) return { query, stage: 'book', books };
  if (chapterText === undefined && books.length > 1)
    return { query, stage: 'book', books };
  if (chapterText === undefined)
    return { query, stage: 'chapter', books: [book] };

  const address: ScriptureAddress = {
    book: book.id,
    chapter: Number(chapterText),
    ...(verseStartText === undefined
      ? {}
      : { verseStart: Number(verseStartText) }),
    ...(verseEndText === undefined ? {} : { verseEnd: Number(verseEndText) }),
  };
  const validation = validateScriptureAddress(address, structure);
  if (!validation.valid) {
    return {
      query,
      stage:
        verseEndText !== undefined
          ? 'complete'
          : verseStartText !== undefined
            ? 'range'
            : 'chapter',
      books: [book],
      address,
      error: validation.reason,
    };
  }
  if (verseStartText === undefined)
    return { query, stage: 'verse', books: [book], address };
  if (verseEndText === undefined)
    return { query, stage: 'range', books: [book], address };
  return { query, stage: 'complete', books: [book], address };
}
