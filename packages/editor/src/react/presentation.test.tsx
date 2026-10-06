// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

import { createPresentationController } from '../presentation/index.js';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
} from '../components/ui/popover.js';
import {
  ScriptrPresentationProvider,
  ScriptrPresentationSurface,
  useScriptrPresentation,
} from './presentation.js';

function Inspector() {
  const { preferences, update } = useScriptrPresentation();
  return (
    <button onClick={() => update({ contrast: 125 })}>
      {preferences.contrast}
    </button>
  );
}

describe('React presentation adapter', () => {
  it('keeps portalled overlays scoped to their provider and updates them live', () => {
    const first = createPresentationController(undefined, {
      colourScheme: 'dark',
    });
    const second = createPresentationController(undefined, {
      colourScheme: 'light',
    });
    render(
      <>
        <ScriptrPresentationProvider controller={first}>
          <Popover defaultOpen>
            <PopoverContent>
              <PopoverTitle>First overlay</PopoverTitle>
            </PopoverContent>
          </Popover>
        </ScriptrPresentationProvider>
        <ScriptrPresentationProvider controller={second}>
          <Popover defaultOpen>
            <PopoverContent>
              <PopoverTitle>Second overlay</PopoverTitle>
            </PopoverContent>
          </Popover>
        </ScriptrPresentationProvider>
      </>,
    );
    const firstOverlay = screen.getByRole('dialog', { name: 'First overlay' });
    const secondOverlay = screen.getByRole('dialog', {
      name: 'Second overlay',
    });
    expect(firstOverlay).toHaveAttribute('data-colour-scheme', 'dark');
    expect(secondOverlay).toHaveAttribute('data-colour-scheme', 'light');
    act(() => first.update({ colourScheme: 'system', contrast: 125 }));
    expect(firstOverlay).toHaveAttribute('data-colour-scheme', 'system');
    expect(secondOverlay).toHaveAttribute('data-colour-scheme', 'light');
  });

  it('proposes controlled changes without applying them until the host accepts them', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ScriptrPresentationProvider value={{ contrast: 90 }} onChange={onChange}>
        <Inspector />
      </ScriptrPresentationProvider>,
    );
    act(() => screen.getByRole('button').click());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ contrast: 125 }),
    );
    expect(screen.getByRole('button').textContent).toBe('90');
    rerender(
      <ScriptrPresentationProvider
        value={{ contrast: 125 }}
        onChange={onChange}
      >
        <Inspector />
      </ScriptrPresentationProvider>,
    );
    expect(screen.getByRole('button').textContent).toBe('125');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('subscribes to an injected controller', () => {
    const controller = createPresentationController();
    render(
      <ScriptrPresentationProvider controller={controller}>
        <Inspector />
      </ScriptrPresentationProvider>,
    );
    act(() => controller.update({ themeId: 'modern-sans' }));
    expect(controller.getSnapshot().preferences.themeId).toBe('modern-sans');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button').textContent).toBe('125');
  });

  it('renders deterministically on the server without reading browser preferences', () => {
    expect(() =>
      renderToString(
        <ScriptrPresentationProvider defaultValue={{ colourScheme: 'system' }}>
          <ScriptrPresentationSurface>
            <Inspector />
          </ScriptrPresentationSurface>
        </ScriptrPresentationProvider>,
      ),
    ).not.toThrow();
  });
});
