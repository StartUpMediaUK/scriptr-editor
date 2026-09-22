// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createPresentationController } from '../presentation/index.js';
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
