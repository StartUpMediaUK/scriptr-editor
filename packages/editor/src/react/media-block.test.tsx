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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('media blocks', () => {
  it.each(['audio', 'video'] as const)(
    'replaces %s through its host and reports validation failure',
    async (kind) => {
      const validate = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('Replacement rejected');
        })
        .mockImplementation(() => undefined);
      const replace = vi.fn(() =>
        Promise.resolve({
          assetId: 'new-media',
          kind,
          src: 'https://example.com/new',
          mimeType: `${kind}/test`,
        }),
      );
      const onChange = vi.fn();
      render(
        <MediaBlockContent
          block={{
            id: kind,
            type: kind,
            title: 'Test media',
            assetId: 'old-media',
            src: 'https://example.com/old',
          }}
          editable
          mediaHost={{
            validate,
            replace,
            upload: vi.fn(),
            resolve: vi.fn(),
            onRemoved: vi.fn(),
          }}
          onChange={onChange}
        />,
      );
      const input = screen.getByLabelText(`Replace ${kind} file`);
      const file = new File(['media'], 'test', { type: `${kind}/test` });
      fireEvent.change(input, { target: { files: [file] } });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Replacement rejected',
      );
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            assetId: 'new-media',
            src: 'https://example.com/new',
          }),
        ),
      );
      expect(replace).toHaveBeenCalledWith(
        'old-media',
        expect.objectContaining({ file, kind }),
      );
    },
  );
  it('renders decoded samples and clears old bars while a replacement is loading', async () => {
    const decoded = {
      numberOfChannels: 1,
      getChannelData: () => new Float32Array([0, 0.5, 1]),
    };
    let finishReplacement: ((value: typeof decoded) => void) | undefined;
    const decode = vi
      .fn()
      .mockResolvedValueOnce(decoded)
      .mockImplementationOnce(
        () =>
          new Promise<typeof decoded>((resolve) => {
            finishReplacement = resolve;
          }),
      );
    const fetchSource = vi.fn<
      (source: RequestInfo | URL, options?: RequestInit) => Promise<Response>
    >(() => Promise.resolve(new Response(new Uint8Array([1]))));
    vi.stubGlobal('fetch', fetchSource);
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = decode;
      },
    );
    const block = {
      id: 'audio',
      type: 'audio',
      title: 'Message',
      src: 'https://example.com/first.wav',
    } as const;
    const { container, rerender, unmount } = render(
      <MediaBlockContent block={block} />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-amplitude]')).toHaveLength(54),
    );
    expect(container.querySelector('[data-amplitude="0"]')).toHaveStyle({
      height: '0%',
    });
    expect(container.querySelector('[data-amplitude="0.5"]')).toHaveStyle({
      height: '50%',
    });
    expect(container.querySelector('[data-amplitude="1"]')).toHaveStyle({
      height: '100%',
    });
    rerender(
      <MediaBlockContent
        block={{ ...block, src: 'https://example.com/replacement.wav' }}
      />,
    );
    expect(container.querySelectorAll('[data-amplitude]')).toHaveLength(0);
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
    finishReplacement?.(decoded);
    await waitFor(() =>
      expect(container.querySelectorAll('[data-amplitude]')).toHaveLength(54),
    );
    expect(fetchSource.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    unmount();
    expect(fetchSource.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });

  it('keeps play and seek available when waveform analysis fails, without fake bars', async () => {
    vi.stubGlobal('OfflineAudioContext', class {});
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    const { container } = render(
      <MediaBlockContent
        block={{
          id: 'audio',
          type: 'audio',
          title: 'Message',
          src: 'https://example.com/blocked.wav',
        }}
      />,
    );
    await screen.findByText('Waveform unavailable');
    expect(container.querySelectorAll('[data-amplitude]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(screen.getByRole('slider', { name: 'Seek audio' })).toBeEnabled();
  });

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
      screen.getByRole('slider', { name: 'Seek audio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Back 5 seconds' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rename audio' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Replace audio file')).toHaveAttribute(
      'hidden',
    );
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
