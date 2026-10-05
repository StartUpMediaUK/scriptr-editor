import { describe, expect, it } from 'vitest';

import { defineScriptr } from '../config.js';
import { createCommandCatalogue } from './catalogue.js';

describe('command catalogue', () => {
  it('groups portable defaults and keeps missing provider workflows discoverable', () => {
    const catalogue = defineScriptr().commands;

    expect(catalogue.groups().map((group) => group.label)).toEqual([
      'Basic',
      'Scripture',
      'Annotation',
      'Layout',
      'Media',
    ]);
    expect(catalogue.all.find((item) => item.id === 'heading-1')).toMatchObject(
      {
        notation: '#',
        icon: 'heading',
      },
    );
    expect(catalogue.all.find((item) => item.id === 'scripture')).toMatchObject(
      {
        disabled: true,
        unavailableReason: 'Requires host setup',
      },
    );
    expect(catalogue.search('verse').map((item) => item.id)).toContain(
      'scripture',
    );
    expect(catalogue.search('link').map((item) => item.id)).toContain('link');
  });

  it('searches notation and enables capability-backed categories', () => {
    const features = defineScriptr({
      capabilities: {
        bookmarks: { resolve: (url) => Promise.resolve({ url, title: url }) },
      },
    }).features;
    const catalogue = createCommandCatalogue({ features });

    expect(catalogue.search('URL').map((item) => item.id)).toContain(
      'web-bookmark',
    );
    expect(catalogue.groups().at(-1)?.label).toBe('Media');
    expect(
      catalogue.all.find((item) => item.id === 'web-bookmark'),
    ).not.toHaveProperty('disabled');
  });

  it('validates extension category and identifier collisions', () => {
    const features = defineScriptr().features;
    const extension = {
      id: 'example:prayer',
      category: 'extension' as const,
      label: 'Prayer',
      notation: '🙏',
      icon: 'extension' as const,
      keywords: ['pray'],
    };

    expect(
      createCommandCatalogue({ features, extensions: [extension] }).groups(),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Extensions' }),
      ]),
    );
    expect(() =>
      createCommandCatalogue({ features, extensions: [extension, extension] }),
    ).toThrow('Duplicate command id');
  });
});
