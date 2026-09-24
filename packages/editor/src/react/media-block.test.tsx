/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MediaHost, MediaUploadInput } from '../host/media.js';
import { MediaBlockContent, MediaUploader } from './media-block.js';

afterEach(cleanup);

describe('media blocks', () => {
  it('uploads typed media through the host capability', async () => {
    const upload: MediaHost['upload'] = vi.fn((input: MediaUploadInput) =>
      Promise.resolve({
        assetId: 'video-asset',
        kind: input.kind,
        src: 'https://example.com/teaching.mp4',
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
      }),
    );
    const onUploaded = vi.fn();
    render(
      <MediaUploader
        createBlockId={() => 'video'}
        kind="video"
        mediaHost={{ upload, resolve: vi.fn(), onRemoved: vi.fn() }}
        onCancel={vi.fn()}
        onUploaded={onUploaded}
      />,
    );
    const file = new File(['video'], 'teaching.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('Choose video'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'video',
          type: 'video',
          assetId: 'video-asset',
          title: 'teaching',
        }),
      ),
    );
  });

  it('resolves hosted audio and exposes compact player and hover actions', async () => {
    const onChange = vi.fn();
    render(
      <MediaBlockContent
        block={{
          id: 'audio',
          type: 'audio',
          assetId: 'audio-asset',
          title: 'Message',
        }}
        editable
        mediaHost={{
          upload: vi.fn(),
          resolve: () =>
            Promise.resolve({
              assetId: 'audio-asset',
              kind: 'audio',
              src: 'https://example.com/message.mp3',
              mimeType: 'audio/mpeg',
            }),
          onRemoved: vi.fn(),
        }}
        onChange={onChange}
      />,
    );
    expect(
      screen
        .getByRole('button', { name: 'Edit caption' })
        .closest('.scriptr-editor__context-toolbar'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(document.querySelector('audio')).toHaveAttribute(
        'src',
        'https://example.com/message.mp3',
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Seek audio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back 5 seconds' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rename audio' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename audio' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename audio' }), {
      target: { value: 'Edited message' },
    });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Rename audio' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Edited message' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Playback speed' }));
    expect(
      screen.getByRole('button', { name: 'Playback speed' }),
    ).toHaveTextContent('1.25×');
    fireEvent.click(screen.getByRole('button', { name: 'Edit caption' }));
    fireEvent.change(screen.getByLabelText('audio caption'), {
      target: { value: 'A transcript.' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: [{ type: 'text', text: 'A transcript.' }],
      }),
    );
  });
});
