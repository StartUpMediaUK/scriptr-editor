import { describe, expect, it, vi } from 'vitest';

import { createPresentationController } from './controller.js';

describe('presentation controller', () => {
  it('resolves theme, developer defaults, and user settings in order', () => {
    const controller = createPresentationController(
      {
        defaults: {
          themeId: 'modern-sans',
          typography: { body: { fontId: 'inter', size: 20 } },
        },
      },
      { contrast: 120, typography: { body: { fontId: 'roboto', size: 22 } } },
    );
    const snapshot = controller.getSnapshot();
    expect(snapshot.preferences.typography.heading.fontId).toBe('system-sans');
    expect(snapshot.preferences.typography.body).toEqual({
      fontId: 'roboto',
      size: 22,
    });
    expect(snapshot.cssVariables['--scriptr-font-accent']).toContain(
      'Playfair Display',
    );
    expect(snapshot.cssVariables['--scriptr-contrast']).toBe('120%');
  });

  it('extends or replaces registries without mutating built-ins', () => {
    const extended = createPresentationController({
      fonts: {
        extend: [
          {
            id: 'custom',
            label: 'Custom',
            family: 'Custom, serif',
            kind: 'serif',
          },
        ],
      },
    });
    expect(
      extended.getSnapshot().fonts.some(({ id }) => id === 'system-serif'),
    ).toBe(true);
    expect(extended.getSnapshot().fonts.at(-1)?.id).toBe('custom');

    const replaced = createPresentationController({
      fonts: {
        replace: [
          {
            id: 'custom',
            label: 'Custom',
            family: 'Custom, serif',
            kind: 'serif',
          },
        ],
      },
    });
    expect(replaced.getSnapshot().fonts).toHaveLength(1);
  });

  it('updates, subscribes, clamps contrast, and resets', () => {
    const controller = createPresentationController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.update({ colourScheme: 'dark', contrast: 999 });
    expect(controller.getSnapshot().preferences.colourScheme).toBe('dark');
    expect(controller.getSnapshot().preferences.contrast).toBe(150);
    controller.reset();
    expect(controller.getSnapshot().preferences.colourScheme).toBe('system');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
