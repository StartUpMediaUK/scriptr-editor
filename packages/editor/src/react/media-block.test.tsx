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

  it('resolves hosted audio and exposes editable metadata controls', async () => {
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

    await waitFor(() =>
      expect(document.querySelector('audio')).toHaveAttribute(
        'src',
        'https://example.com/message.mp3',
      ),
    );
    fireEvent.change(screen.getByLabelText('Transcript'), {
      target: { value: 'A transcript.' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: [{ type: 'text', text: 'A transcript.' }],
      }),
    );
  });
});
