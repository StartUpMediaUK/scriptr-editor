import { z } from 'zod';

import type { ScriptureAddress } from '../document/types.js';
import type {
  PassageText,
  ScriptureProvider,
  ScriptureTranslation,
} from '../host/scripture.js';
import { ScriptureProviderError } from '../host/scripture.js';
import { validateScriptureAddress } from './address.js';
import {
  canonicalBookDefinitions,
  canonicalBooks,
  type CanonicalBookId,
} from './books.js';
import type { ScriptureStructure } from './types.js';

const canonicalBookIds = canonicalBooks.map(([id]) => id);
const canonicalBookIdSchema = z.enum(canonicalBookIds);
const positiveIntegerKey = z.string().regex(/^[1-9]\d*$/, {
  error: 'Expected a positive one-based integer key.',
});
const verseTextSchema = z.string().trim().min(1, 'Verse text cannot be empty.');
const verseRecordSchema = z.record(positiveIntegerKey, verseTextSchema);
const chapterRecordSchema = z.record(positiveIntegerKey, verseRecordSchema);
const booksSchema = z.partialRecord(canonicalBookIdSchema, chapterRecordSchema);

export const localScriptureDatasetSchema = z
  .object({
    version: z.literal(1),
    translations: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          name: z.string().trim().min(1),
          abbreviation: z.string().trim().min(1),
          languageTag: z.string().trim().min(1),
          attribution: z.string().trim().min(1),
          copyright: z.string().trim().min(1).optional(),
          license: z
            .object({
              name: z.string().trim().min(1),
              url: z.url().optional(),
              attributionRequired: z.boolean(),
            })
            .optional(),
          coverage: z.enum(['complete', 'partial']),
          books: booksSchema,
        }),
      )
      .min(1),
  })
  .superRefine((dataset, context) => {
    const translationIds = new Set<string>();
    for (const [
      translationIndex,
      translation,
    ] of dataset.translations.entries()) {
      if (translationIds.has(translation.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate translation id: ${translation.id}`,
          path: ['translations', translationIndex, 'id'],
        });
      }
      translationIds.add(translation.id);

      for (const definition of canonicalBookDefinitions) {
        const chapters = translation.books[definition.id];
        if (!chapters) {
          if (translation.coverage === 'complete') {
            context.addIssue({
              code: 'custom',
              message: `Complete translation is missing ${definition.name}.`,
              path: ['translations', translationIndex, 'books', definition.id],
            });
          }
          continue;
        }

        for (const chapterKey of Object.keys(chapters)) {
          if (Number(chapterKey) > definition.chapterCount) {
            context.addIssue({
              code: 'custom',
              message: `${definition.name} has only ${definition.chapterCount} chapters.`,
              path: [
                'translations',
                translationIndex,
                'books',
                definition.id,
                chapterKey,
              ],
            });
          }
        }

        if (translation.coverage === 'complete') {
          for (
            let chapter = 1;
            chapter <= definition.chapterCount;
            chapter += 1
          ) {
            if (!chapters[String(chapter)]) {
              context.addIssue({
                code: 'custom',
                message: `Complete translation is missing ${definition.name} ${chapter}.`,
                path: [
                  'translations',
                  translationIndex,
                  'books',
                  definition.id,
                  String(chapter),
                ],
              });
            }
          }
        }
      }
    }
  });

export type LocalScriptureDataset = z.infer<typeof localScriptureDatasetSchema>;
export type LocalScriptureTranslation =
  LocalScriptureDataset['translations'][number];

export function parseLocalScriptureDataset(
  input: unknown,
): LocalScriptureDataset {
  return localScriptureDatasetSchema.parse(input);
}

function translationMetadata(
  translation: LocalScriptureTranslation,
): ScriptureTranslation {
  return {
    id: translation.id,
    name: translation.name,
    abbreviation: translation.abbreviation,
    languageTag: translation.languageTag,
    attribution: translation.attribution,
    ...(translation.copyright ? { copyright: translation.copyright } : {}),
  };
}

function buildStructure(dataset: LocalScriptureDataset): ScriptureStructure {
  return {
    books: canonicalBookDefinitions.flatMap((definition, bookIndex) => {
      const available = dataset.translations.some(
        (translation) => translation.books[definition.id] !== undefined,
      );
      if (!available) return [];

      const chapters = Array.from(
        { length: definition.chapterCount },
        (_, chapterIndex) => {
          const chapter = String(chapterIndex + 1);
          return Math.max(
            0,
            ...dataset.translations.flatMap((translation) => {
              const verses = translation.books[definition.id]?.[chapter];
              return verses
                ? Object.keys(verses).map((verse) => Number(verse))
                : [];
            }),
          );
        },
      );
      let lastAvailableChapter = -1;
      for (let index = chapters.length - 1; index >= 0; index -= 1) {
        if (chapters[index] !== 0) {
          lastAvailableChapter = index;
          break;
        }
      }
      if (lastAvailableChapter < 0) return [];

      return [
        {
          id: definition.id,
          name: definition.name,
          aliases: definition.aliases,
          testament: bookIndex < 39 ? ('old' as const) : ('new' as const),
          translationNames: Object.fromEntries(
            dataset.translations.map((translation) => [
              translation.id,
              definition.name,
            ]),
          ),
          chapters: chapters.slice(0, lastAvailableChapter + 1),
        },
      ];
    }),
  };
}

function passageText(
  translation: LocalScriptureTranslation,
  address: ScriptureAddress,
): string | undefined {
  const chapter =
    translation.books[address.book as CanonicalBookId]?.[
      String(address.chapter)
    ];
  if (!chapter) return undefined;

  const availableVerses = Object.keys(chapter)
    .map(Number)
    .sort((left, right) => left - right);
  const start = address.verseStart ?? availableVerses[0];
  const end = address.verseEnd ?? address.verseStart ?? availableVerses.at(-1);
  if (start === undefined || end === undefined) return undefined;

  const verses: string[] = [];
  for (let verse = start; verse <= end; verse += 1) {
    const text = chapter[String(verse)];
    if (!text) return undefined;
    verses.push(text);
  }
  return verses.join(' ');
}

export function createLocalScriptureProvider(
  datasetInput: LocalScriptureDataset,
): ScriptureProvider {
  const dataset = parseLocalScriptureDataset(datasetInput);
  const structure = buildStructure(dataset);
  const translations = new Map(
    dataset.translations.map((translation) => [translation.id, translation]),
  );
  const resolve = <Value>(
    signal: AbortSignal | undefined,
    value: () => Value,
  ) =>
    Promise.resolve().then(() => {
      signal?.throwIfAborted();
      return value();
    });

  return {
    listTranslations(signal) {
      return resolve(signal, () =>
        dataset.translations.map(translationMetadata),
      );
    },
    getStructure(signal) {
      return resolve(signal, () => structure);
    },
    canonicalizeAddress(address, signal) {
      return resolve(signal, () => {
        const validation = validateScriptureAddress(address, structure);
        if (!validation.valid) {
          throw new ScriptureProviderError(
            'not-found',
            validation.reason,
            false,
          );
        }
        return validation.address;
      });
    },
    getPassage(address, translationId, signal) {
      return resolve(signal, (): PassageText => {
        const translation = translations.get(translationId);
        if (!translation) {
          throw new ScriptureProviderError(
            'not-found',
            `Unknown Scripture translation: ${translationId}`,
            false,
          );
        }
        const validation = validateScriptureAddress(address, structure);
        if (!validation.valid) {
          throw new ScriptureProviderError(
            'not-found',
            validation.reason,
            false,
          );
        }
        const text = passageText(translation, validation.address);
        if (!text) {
          throw new ScriptureProviderError(
            'not-found',
            'The requested passage is unavailable in this dataset.',
            false,
          );
        }
        return {
          address: validation.address,
          translationId,
          text,
          attribution: translation.attribution,
          cache: 'persistent',
        };
      });
    },
  };
}
