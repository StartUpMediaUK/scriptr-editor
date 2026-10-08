import { z } from 'zod';
import { resolveDocumentAnchor } from './anchors.js';
import type { ContentContribution } from './changes.js';
import type { CanonicalDocument } from './types.js';

/** Host-owned, versioned sidecar; never part of the canonical document. */
export type DocumentProvenance = {
  readonly version: 1;
  readonly contributions: readonly ContentContribution[];
};

const anchorSchema = z
  .object({
    blockId: z.string().min(1),
    itemId: z.string().min(1).optional(),
    field: z.enum([
      'content',
      'summary',
      'code',
      'caption',
      'transcript',
      'block',
    ]),
    offset: z.number().int().nonnegative(),
    length: z.number().int().nonnegative(),
  })
  .strict();

const provenanceSchema = z
  .object({
    version: z.literal(1),
    contributions: z.array(
      z
        .object({
          id: z.string().min(1),
          anchors: z.array(anchorSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

/** Reject malformed, unsupported or stale provenance as a whole, never drop it silently. */
export function parseDocumentProvenance(
  value: unknown,
  document: CanonicalDocument,
): DocumentProvenance {
  return provenanceSchema
    .superRefine((sidecar, context) => {
      const ids = new Set<string>();
      const occupied = new Map<string, { start: number; end: number }[]>();
      sidecar.contributions.forEach((contribution, index) => {
        if (ids.has(contribution.id))
          context.addIssue({
            code: 'custom',
            path: ['contributions', index, 'id'],
            message: 'Duplicate contribution identity.',
          });
        ids.add(contribution.id);
        contribution.anchors.forEach((anchor, anchorIndex) => {
          const path = ['contributions', index, 'anchors', anchorIndex];
          if (!resolveDocumentAnchor(document, anchor))
            context.addIssue({
              code: 'custom',
              path,
              message: 'Anchor does not resolve in the supplied document.',
            });
          if (anchor.field !== 'block' && anchor.length === 0)
            context.addIssue({
              code: 'custom',
              path,
              message: 'Text contributions must contain authored content.',
            });
          const key = JSON.stringify([
            anchor.blockId,
            anchor.itemId,
            anchor.field,
          ]);
          const ranges = occupied.get(key) ?? [];
          if (
            ranges.some(
              (range) =>
                anchor.field === 'block' ||
                (anchor.offset < range.end &&
                  anchor.offset + anchor.length > range.start),
            )
          )
            context.addIssue({
              code: 'custom',
              path,
              message: 'Contribution ranges overlap.',
            });
          ranges.push({
            start: anchor.offset,
            end: anchor.offset + anchor.length,
          });
          occupied.set(key, ranges);
        });
      });
    })
    .parse(value);
}
