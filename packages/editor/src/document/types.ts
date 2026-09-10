export const DOCUMENT_VERSION = 2 as const;

export type DocumentVersion = typeof DOCUMENT_VERSION;

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type TextStyleMark =
  | { readonly type: 'bold' }
  | { readonly type: 'italic' }
  | { readonly type: 'underline' }
  | { readonly type: 'strikethrough' }
  | { readonly type: 'inlineCode' };

export type ExternalLinkMark = {
  readonly type: 'link';
  readonly href: string;
  readonly title?: string | undefined;
};

export type InternalDocumentLinkMark = {
  readonly type: 'internalDocumentLink';
  readonly targetId: string;
};

export type ReferenceAnchorMark = {
  readonly type: 'reference';
  readonly referenceId: string;
};

export type Mark =
  | TextStyleMark
  | ExternalLinkMark
  | InternalDocumentLinkMark
  | ReferenceAnchorMark;

export type TextInline = {
  readonly type: 'text';
  readonly text: string;
  readonly marks?: readonly Mark[] | undefined;
};

export type HardBreakInline = { readonly type: 'hardBreak' };

export type InlineContent = TextInline | HardBreakInline;

export type BlockBase = { readonly id: string };

export type ParagraphBlock = BlockBase & {
  readonly type: 'paragraph';
  readonly content: readonly InlineContent[];
};

export type HeadingBlock = BlockBase & {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly content: readonly InlineContent[];
};

export type BlockquoteBlock = BlockBase & {
  readonly type: 'blockquote';
  readonly content: readonly InlineContent[];
};

export type CodeBlock = BlockBase & {
  readonly type: 'codeBlock';
  readonly code: string;
  readonly language?: string | undefined;
};

export type CalloutTone = 'note' | 'info' | 'warning';

export type CalloutBlock = BlockBase & {
  readonly type: 'callout';
  readonly tone: CalloutTone;
  readonly content: readonly InlineContent[];
};

export type DividerBlock = BlockBase & { readonly type: 'divider' };

export type ListKind = 'bullet' | 'numbered' | 'check';

export type ListItem = {
  readonly id: string;
  readonly content: readonly InlineContent[];
  readonly checked?: boolean | undefined;
  readonly children?: readonly ListItem[] | undefined;
};

export type ListBlock = BlockBase & {
  readonly type: 'list';
  readonly kind: ListKind;
  readonly start?: number | undefined;
  readonly items: readonly ListItem[];
};

export type ScriptureAddress = {
  readonly book: string;
  readonly chapter: number;
  readonly verseStart?: number | undefined;
  readonly verseEnd?: number | undefined;
};

export type ScriptureBlock = BlockBase & {
  readonly type: 'scripture';
  readonly address: ScriptureAddress;
  readonly translationId: string;
};

export type TranslationComparisonBlock = BlockBase & {
  readonly type: 'translationComparison';
  readonly address: ScriptureAddress;
  readonly translationIds: readonly string[];
  readonly layout: 'oneColumn' | 'twoColumn';
};

export type ImageAlignment = 'start' | 'center' | 'end' | 'wide';

export type ImageBlock = BlockBase & {
  readonly type: 'image';
  readonly assetId: string;
  readonly src?: string | undefined;
  readonly alt: string;
  readonly caption?: readonly InlineContent[] | undefined;
  readonly alignment: ImageAlignment;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
};

export type MediaSource = {
  readonly assetId?: string | undefined;
  readonly src?: string | undefined;
};

export type VideoBlock = BlockBase &
  MediaSource & {
    readonly type: 'video';
    readonly title?: string | undefined;
    readonly posterAssetId?: string | undefined;
    readonly caption?: readonly InlineContent[] | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  };

export type AudioBlock = BlockBase &
  MediaSource & {
    readonly type: 'audio';
    readonly title: string;
    readonly transcript?: readonly InlineContent[] | undefined;
  };

export type WebBookmarkBlock = BlockBase & {
  readonly type: 'webBookmark';
  readonly url: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly siteName?: string | undefined;
  readonly imageAssetId?: string | undefined;
};

export type ExtensionBlock = BlockBase & {
  readonly type: 'extension';
  readonly name: string;
  readonly version: number;
  readonly data: JsonValue;
};

export type Column = {
  readonly id: string;
  readonly content: readonly Block[];
};

export type ColumnLayoutBlock = BlockBase & {
  readonly type: 'columns';
  readonly columns: readonly Column[];
};

export type ToggleBlock = BlockBase & {
  readonly type: 'toggle';
  readonly summary: readonly InlineContent[];
  readonly headingLevel?: 1 | 2 | 3 | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly content: readonly Block[];
};

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | BlockquoteBlock
  | CodeBlock
  | CalloutBlock
  | DividerBlock
  | ListBlock
  | ScriptureBlock
  | TranslationComparisonBlock
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | WebBookmarkBlock
  | ColumnLayoutBlock
  | ToggleBlock
  | ExtensionBlock;

export type ReferenceContentBlock = {
  readonly type: 'paragraph' | 'listItem';
  readonly content: readonly TextInline[];
};

export type Reference = {
  readonly id: string;
  readonly content: readonly ReferenceContentBlock[];
};

export type CanonicalDocument = {
  readonly version: DocumentVersion;
  readonly content: readonly Block[];
  readonly references?: Readonly<Record<string, Reference>> | undefined;
};
