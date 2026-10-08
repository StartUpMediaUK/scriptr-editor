import type { DocumentAnchor } from './anchors.js';

/** A contribution can split across blocks while retaining its original identity. */
export type ContentContribution = {
  readonly id: string;
  readonly anchors: readonly DocumentAnchor[];
};

export type DocumentChangeDetails = {
  readonly version: 1;
  readonly provenance: 'complete' | 'unresolved';
  readonly source: 'input' | 'paste' | 'undo' | 'redo' | 'external';
  readonly kinds: readonly (
    | 'insertion'
    | 'replacement'
    | 'deletion'
    | 'formatting'
    | 'structure'
    | 'reference'
    | 'scripture'
  )[];
  readonly additions: readonly ContentContribution[];
  readonly contributions: readonly ContentContribution[];
  readonly removedContributionIds: readonly string[];
  readonly restoredContributionIds: readonly string[];
};
