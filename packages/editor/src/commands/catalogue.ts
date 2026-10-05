import type { ScriptrFeatures } from '../config.js';

export const COMMAND_CATEGORIES = [
  'basic',
  'scripture',
  'annotation',
  'layout',
  'media',
  'extension',
] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export type CommandIcon =
  | 'text'
  | 'accent'
  | 'heading'
  | 'list'
  | 'checklist'
  | 'quote'
  | 'code'
  | 'callout'
  | 'divider'
  | 'scripture'
  | 'compare'
  | 'reference'
  | 'link'
  | 'columns'
  | 'toggle'
  | 'image'
  | 'video'
  | 'audio'
  | 'bookmark'
  | 'extension';

export type ScriptrCommand = {
  readonly id: string;
  readonly category: CommandCategory;
  readonly label: string;
  readonly notation: string;
  readonly icon: CommandIcon;
  readonly keywords: readonly string[];
  readonly disabled?: true | undefined;
  readonly unavailableReason?: string | undefined;
};

export type CommandGroup = {
  readonly category: CommandCategory;
  readonly label: string;
  readonly commands: readonly ScriptrCommand[];
};

export type CommandCatalogue = {
  readonly all: readonly ScriptrCommand[];
  readonly search: (query?: string) => readonly ScriptrCommand[];
  readonly groups: (query?: string) => readonly CommandGroup[];
};

const categoryLabels: Readonly<Record<CommandCategory, string>> = {
  basic: 'Basic',
  scripture: 'Scripture',
  annotation: 'Annotation',
  layout: 'Layout',
  media: 'Media',
  extension: 'Extensions',
};

type BuiltinCommand = ScriptrCommand & {
  readonly feature?: keyof ScriptrFeatures | undefined;
};

const command = (
  id: string,
  category: CommandCategory,
  label: string,
  notation: string,
  icon: CommandIcon,
  keywords: readonly string[],
  feature?: keyof ScriptrFeatures,
): BuiltinCommand => ({
  id,
  category,
  label,
  notation,
  icon,
  keywords,
  ...(feature ? { feature } : {}),
});

const builtins: readonly BuiltinCommand[] = [
  command('text', 'basic', 'Text', 'Aa', 'text', ['paragraph', 'plain']),
  command('heading-1', 'basic', 'Heading 1', '#', 'heading', ['h1', 'title']),
  command('heading-2', 'basic', 'Heading 2', '##', 'heading', [
    'h2',
    'section',
  ]),
  command('heading-3', 'basic', 'Heading 3', '###', 'heading', [
    'h3',
    'subsection',
  ]),
  command('accent', 'basic', 'Accent', 'Abc', 'accent', ['font', 'typeface']),
  command('bullet-list', 'basic', 'Bulleted list', '-', 'list', [
    'unordered',
    'bullet',
  ]),
  command('ordered-list', 'basic', 'Numbered list', '1.', 'list', [
    'ordered',
    'number',
  ]),
  command('checklist', 'basic', 'Checklist', '[]', 'checklist', [
    'task',
    'todo',
    'check',
  ]),
  command('quote', 'basic', 'Quote', '>', 'quote', ['blockquote']),
  command('code', 'basic', 'Code', '```', 'code', ['pre', 'code block']),
  command('callout', 'basic', 'Callout', '!', 'callout', ['note', 'aside']),
  command('divider', 'basic', 'Divider', '---', 'divider', ['rule', 'line']),
  command(
    'scripture',
    'scripture',
    'Scripture',
    'Jn 3:16',
    'scripture',
    ['bible', 'passage', 'verse'],
    'scripture',
  ),
  command(
    'comparison',
    'scripture',
    'Translation comparison',
    'A | B',
    'compare',
    ['compare', 'translations'],
    'comparison',
  ),
  command(
    'reference',
    'annotation',
    'Reference',
    '[1]',
    'reference',
    ['annotation', 'note', 'footnote'],
    'references',
  ),
  command('link', 'annotation', 'Link', 'https://', 'link', [
    'url',
    'website',
    'external',
  ]),
  command(
    'internal-link',
    'annotation',
    'Internal link',
    '[[',
    'link',
    ['page', 'document', 'link'],
    'internalLinks',
  ),
  command(
    'columns',
    'layout',
    'Columns',
    '||',
    'columns',
    ['layout', 'split'],
    'columns',
  ),
  command(
    'toggle',
    'layout',
    'Toggle',
    '▸',
    'toggle',
    ['details', 'collapse'],
    'toggles',
  ),
  command(
    'toggle-heading-1',
    'layout',
    'Toggle heading 1',
    '▸ #',
    'toggle',
    ['details', 'collapse', 'h1'],
    'toggles',
  ),
  command(
    'toggle-heading-2',
    'layout',
    'Toggle heading 2',
    '▸ ##',
    'toggle',
    ['details', 'collapse', 'h2'],
    'toggles',
  ),
  command(
    'toggle-heading-3',
    'layout',
    'Toggle heading 3',
    '▸ ###',
    'toggle',
    ['details', 'collapse', 'h3'],
    'toggles',
  ),
  command(
    'image',
    'media',
    'Image',
    'IMG',
    'image',
    ['photo', 'picture', 'upload'],
    'images',
  ),
  command(
    'video',
    'media',
    'Video',
    'VID',
    'video',
    ['movie', 'upload', 'embed'],
    'video',
  ),
  command(
    'audio',
    'media',
    'Audio',
    'AUD',
    'audio',
    ['sound', 'recording', 'upload'],
    'audio',
  ),
  command(
    'web-bookmark',
    'media',
    'Web bookmark',
    'URL',
    'bookmark',
    ['link', 'website', 'preview'],
    'bookmarks',
  ),
];

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function createCommandCatalogue(options: {
  readonly features: ScriptrFeatures;
  readonly extensions?: readonly ScriptrCommand[] | undefined;
}): CommandCatalogue {
  const commands = builtins.map(
    ({ feature, ...item }): ScriptrCommand =>
      feature === undefined || options.features[feature]
        ? item
        : {
            ...item,
            disabled: true,
            unavailableReason: 'Requires host setup',
          },
  );
  const ids = new Set(commands.map((item) => item.id));
  const extensions = (options.extensions ?? []).map((item) => {
    if (item.category !== 'extension')
      throw new Error(
        `Extension command must use the extension category: ${item.id}`,
      );
    if (ids.has(item.id)) throw new Error(`Duplicate command id: ${item.id}`);
    ids.add(item.id);
    return item;
  });
  const all = Object.freeze([...commands, ...extensions]);
  const search = (query = '') => {
    const needle = normalize(query);
    if (!needle) return all;
    return all.filter((item) =>
      normalize(
        `${item.label} ${item.notation} ${item.keywords.join(' ')}`,
      ).includes(needle),
    );
  };
  const groups = (query = '') => {
    const matches = search(query);
    return COMMAND_CATEGORIES.flatMap((category): CommandGroup[] => {
      const commands = matches.filter((item) => item.category === category);
      return commands.length
        ? [{ category, label: categoryLabels[category], commands }]
        : [];
    });
  };
  return Object.freeze({ all, search, groups });
}
