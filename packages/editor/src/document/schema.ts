import { z } from 'zod';

import { DOCUMENT_VERSION } from './types.js';
import type { Block, InlineContent, JsonValue, ListItem } from './types.js';

const nonEmptyId = z.string().trim().min(1);
const positiveInteger = z.number().int().positive();
const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('accent') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z.object({ type: z.literal('strikethrough') }).strict(),
  z.object({ type: z.literal('inlineCode') }).strict(),
  z
    .object({
      type: z.literal('link'),
      href: z.string().url(),
      title: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('internalDocumentLink'),
      targetId: nonEmptyId,
    })
    .strict(),
  z.object({ type: z.literal('reference'), referenceId: nonEmptyId }).strict(),
  z
    .object({ type: z.literal('textColour'), colour: z.string().trim().min(1) })
    .strict(),
  z
    .object({
      type: z.literal('highlightColour'),
      colour: z.string().trim().min(1),
    })
    .strict(),
]);

const textInlineSchema = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1),
    marks: z.array(markSchema).optional(),
  })
  .strict();

const hardBreakInlineSchema = z
  .object({ type: z.literal('hardBreak') })
  .strict();
const inlineContentSchema = z.discriminatedUnion('type', [
  textInlineSchema,
  hardBreakInlineSchema,
]);
const inlineArraySchema = z.array(inlineContentSchema);
const blockBackgroundSchema = z.enum([
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]);
const blockBaseShape = {
  id: nonEmptyId,
  background: blockBackgroundSchema.optional(),
};

const paragraphBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('paragraph'),
    content: inlineArraySchema,
  })
  .strict();
const headingBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('heading'),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    content: inlineArraySchema,
  })
  .strict();
const blockquoteBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('blockquote'),
    content: inlineArraySchema,
  })
  .strict();
const codeBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('codeBlock'),
    code: z.string(),
    language: z.string().trim().min(1).optional(),
  })
  .strict();
const calloutBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('callout'),
    tone: z.enum(['note', 'info', 'warning']),
    content: inlineArraySchema,
  })
  .strict();
const dividerBlockSchema = z
  .object({ ...blockBaseShape, type: z.literal('divider') })
  .strict();

type ListItemInput = {
  id: string;
  content: z.input<typeof inlineContentSchema>[];
  checked?: boolean | undefined;
  children?: ListItemInput[] | undefined;
};

const listItemSchema: z.ZodType<ListItemInput> = z.lazy(() =>
  z
    .object({
      id: nonEmptyId,
      content: inlineArraySchema,
      checked: z.boolean().optional(),
      children: z.array(listItemSchema).optional(),
    })
    .strict(),
);
const listBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('list'),
    kind: z.enum(['bullet', 'numbered', 'check']),
    start: positiveInteger.optional(),
    items: z.array(listItemSchema).min(1),
  })
  .strict()
  .superRefine((block, context) => {
    const visit = (items: readonly ListItemInput[]) => {
      for (const item of items) {
        if (block.kind === 'check' && item.checked === undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Checklist items require a checked value.',
            path: ['items'],
          });
        }
        if (block.kind !== 'check' && item.checked !== undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Only checklist items may contain a checked value.',
            path: ['items'],
          });
        }
        if (item.children) visit(item.children);
      }
    };
    visit(block.items);

    if (block.kind !== 'numbered' && block.start !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only numbered lists may define a start value.',
        path: ['start'],
      });
    }
  });

export const scriptureAddressSchema = z
  .object({
    book: nonEmptyId,
    chapter: positiveInteger,
    verseStart: positiveInteger.optional(),
    verseEnd: positiveInteger.optional(),
  })
  .strict()
  .superRefine((address, context) => {
    if (address.verseEnd !== undefined && address.verseStart === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A verse range requires verseStart.',
        path: ['verseEnd'],
      });
    }
    if (
      address.verseEnd !== undefined &&
      address.verseStart !== undefined &&
      address.verseEnd < address.verseStart
    ) {
      context.addIssue({
        code: 'custom',
        message: 'verseEnd must not precede verseStart.',
        path: ['verseEnd'],
      });
    }
  });
const scriptureBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('scripture'),
    address: scriptureAddressSchema,
    translationId: nonEmptyId,
  })
  .strict();
const translationComparisonBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('translationComparison'),
    address: scriptureAddressSchema,
    translationIds: z.array(nonEmptyId).min(1),
    layout: z.enum(['oneColumn', 'twoColumn']),
  })
  .strict()
  .superRefine((block, context) => {
    if (new Set(block.translationIds).size !== block.translationIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Translation identifiers must be unique.',
        path: ['translationIds'],
      });
    }
  });
const imageBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('image'),
    assetId: nonEmptyId,
    src: z.string().url().optional(),
    alt: z.string(),
    caption: inlineArraySchema.optional(),
    alignment: z.enum(['start', 'center', 'end', 'wide']),
    cropRatio: z
      .enum(['original', 'square', 'landscape', 'portrait'])
      .optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
  })
  .strict();
const mediaSourceShape = {
  assetId: nonEmptyId.optional(),
  src: z.string().url().optional(),
};
const videoBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('video'),
    ...mediaSourceShape,
    title: z.string().trim().min(1).optional(),
    posterAssetId: nonEmptyId.optional(),
    caption: inlineArraySchema.optional(),
    width: positiveInteger.optional(),
    height: positiveInteger.optional(),
  })
  .strict()
  .refine((block) => block.assetId !== undefined || block.src !== undefined, {
    message: 'Video requires an assetId or src.',
  });
const audioBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('audio'),
    ...mediaSourceShape,
    title: z.string().trim().min(1),
    coverAssetId: nonEmptyId.optional(),
    transcript: inlineArraySchema.optional(),
  })
  .strict()
  .refine((block) => block.assetId !== undefined || block.src !== undefined, {
    message: 'Audio requires an assetId or src.',
  });
const webBookmarkBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('webBookmark'),
    url: z.string().url(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    siteName: z.string().trim().min(1).optional(),
    imageAssetId: nonEmptyId.optional(),
  })
  .strict();
export const extensionBlockSchema = z
  .object({
    ...blockBaseShape,
    type: z.literal('extension'),
    name: nonEmptyId,
    version: positiveInteger,
    data: jsonValueSchema,
  })
  .strict();

export const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    paragraphBlockSchema,
    headingBlockSchema,
    blockquoteBlockSchema,
    codeBlockSchema,
    calloutBlockSchema,
    dividerBlockSchema,
    listBlockSchema,
    scriptureBlockSchema,
    translationComparisonBlockSchema,
    imageBlockSchema,
    videoBlockSchema,
    audioBlockSchema,
    webBookmarkBlockSchema,
    z
      .object({
        ...blockBaseShape,
        type: z.literal('columns'),
        columns: z
          .array(
            z
              .object({
                id: nonEmptyId,
                content: z.array(blockSchema).min(1),
              })
              .strict(),
          )
          .min(2)
          .max(4),
      })
      .strict(),
    z
      .object({
        ...blockBaseShape,
        type: z.literal('toggle'),
        summary: inlineArraySchema,
        headingLevel: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional(),
        defaultOpen: z.boolean().optional(),
        content: z.array(blockSchema).min(1),
      })
      .strict(),
    extensionBlockSchema,
  ]),
);

const referenceTextMarkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }).strict(),
  z.object({ type: z.literal('accent') }).strict(),
  z.object({ type: z.literal('italic') }).strict(),
  z.object({ type: z.literal('underline') }).strict(),
  z
    .object({
      type: z.literal('link'),
      href: z.string().url(),
      title: z.string().trim().min(1).optional(),
    })
    .strict(),
]);
const referenceTextInlineSchema = z
  .object({
    type: z.literal('text'),
    text: z.string().min(1),
    marks: z.array(referenceTextMarkSchema).optional(),
  })
  .strict();
export const referenceSchema = z
  .object({
    id: nonEmptyId,
    title: z.string().trim().min(1).optional(),
    content: z
      .array(
        z
          .object({
            type: z.enum(['paragraph', 'listItem']),
            content: z.array(referenceTextInlineSchema),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const canonicalDocumentSchema = z
  .object({
    version: z.literal(DOCUMENT_VERSION),
    content: z.array(blockSchema),
    references: z.record(nonEmptyId, referenceSchema).optional(),
  })
  .strict()
  .superRefine((document, context) => {
    const structuralIds = new Set<string>();
    const referenceAnchors = new Set<string>();
    const recordStructuralId = (
      id: string,
      path: readonly (number | string)[],
    ) => {
      if (structuralIds.has(id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate structural id: ${id}`,
          path: [...path],
        });
      }
      structuralIds.add(id);
    };
    const recordReferenceAnchors = (
      content: readonly InlineContent[],
      path: readonly (number | string)[],
    ) => {
      for (const [inlineIndex, inline] of content.entries()) {
        if (inline.type !== 'text') continue;
        for (const mark of inline.marks ?? []) {
          if (mark.type !== 'reference') continue;
          referenceAnchors.add(mark.referenceId);
          if (!document.references?.[mark.referenceId]) {
            context.addIssue({
              code: 'custom',
              message: `Reference anchor has no definition: ${mark.referenceId}`,
              path: [...path, inlineIndex, 'marks'],
            });
          }
        }
      }
    };
    const visitListItems = (
      items: readonly ListItem[],
      path: readonly (number | string)[],
    ) => {
      for (const [itemIndex, item] of items.entries()) {
        const itemPath = [...path, itemIndex];
        recordStructuralId(item.id, [...itemPath, 'id']);
        recordReferenceAnchors(item.content, [...itemPath, 'content']);
        if (item.children) {
          visitListItems(item.children, [...itemPath, 'children']);
        }
      }
    };

    const visitBlock = (
      block: Block,
      blockPath: readonly (number | string)[],
    ) => {
      recordStructuralId(block.id, [...blockPath, 'id']);
      switch (block.type) {
        case 'paragraph':
        case 'heading':
        case 'blockquote':
        case 'callout':
          recordReferenceAnchors(block.content, [...blockPath, 'content']);
          break;
        case 'list':
          visitListItems(block.items, [...blockPath, 'items']);
          break;
        case 'image':
          if (block.caption) {
            recordReferenceAnchors(block.caption, [...blockPath, 'caption']);
          }
          break;
        case 'video':
          if (block.caption) {
            recordReferenceAnchors(block.caption, [...blockPath, 'caption']);
          }
          break;
        case 'audio':
          if (block.transcript) {
            recordReferenceAnchors(block.transcript, [
              ...blockPath,
              'transcript',
            ]);
          }
          break;
        case 'columns':
          for (const [columnIndex, column] of block.columns.entries()) {
            const columnPath = [...blockPath, 'columns', columnIndex];
            recordStructuralId(column.id, [...columnPath, 'id']);
            for (const [childIndex, child] of column.content.entries()) {
              visitBlock(child, [...columnPath, 'content', childIndex]);
            }
          }
          break;
        case 'toggle':
          recordReferenceAnchors(block.summary, [...blockPath, 'summary']);
          for (const [childIndex, child] of block.content.entries()) {
            visitBlock(child, [...blockPath, 'content', childIndex]);
          }
          break;
        default:
          break;
      }
    };

    for (const [index, block] of document.content.entries()) {
      visitBlock(block, ['content', index]);
    }

    if (!document.references) return;
    for (const [key, reference] of Object.entries(document.references)) {
      if (key !== reference.id) {
        context.addIssue({
          code: 'custom',
          message: 'Reference map key must equal its id.',
          path: ['references', key, 'id'],
        });
      }
      if (!referenceAnchors.has(key)) {
        context.addIssue({
          code: 'custom',
          message: `Reference definition has no anchor: ${key}`,
          path: ['references', key],
        });
      }
    }
  });
