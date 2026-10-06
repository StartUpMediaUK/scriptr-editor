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

import type { ImageHost, ImageUploadInput } from '../host/images.js';
import { ImageBlockContent, ImageUploader } from './image-block.js';

afterEach(cleanup);

const image = {
  id: 'image-1',
  type: 'image' as const,
  assetId: 'asset-1',
  alt: 'An open Bible',
  alignment: 'center' as const,
  caption: [{ type: 'text' as const, text: 'Morning study' }],
};

describe('ImageBlockContent', () => {
  it('reports synchronous replacement validation failures and allows retrying the same file', async () => {
    const validate = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Image rejected');
      })
      .mockImplementation(() => undefined);
    const replace = vi.fn(() =>
      Promise.resolve({
        assetId: 'new-image',
        src: 'https://example.com/new.png',
        width: 300,
        height: 150,
      }),
    );
    const onChange = vi.fn();
    render(
      <ImageBlockContent
        block={{ ...image, src: 'https://example.com/old.png' }}
        editable
        imageHost={{
          validate,
          replace,
          upload: vi.fn(),
          resolve: vi.fn(),
          onRemoved: vi.fn(),
        }}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Replace image file');
    const file = new File(['image'], 'new.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image rejected',
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          assetId: 'new-image',
          src: 'https://example.com/new.png',
        }),
      ),
    );
    expect(replace).toHaveBeenCalledWith(
      'asset-1',
      expect.objectContaining({ file }),
    );
  });
  it('keeps the crop frame without exposing resize handles', () => {
    const onChange = vi.fn();
    render(
      <ImageBlockContent
        block={{
          ...image,
          src: 'https://example.com/image.png',
          width: 400,
          height: 200,
          cropRatio: 'square',
        }}
        editable
        onChange={onChange}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Resize image from/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img').parentElement).toHaveStyle({
      aspectRatio: '1',
    });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('resolves host-owned assets and preserves authored presentation', async () => {
    const resolve = vi.fn(() =>
      Promise.resolve({
        assetId: 'asset-1',
        src: 'https://example.com/bible.jpg',
        width: 1200,
        height: 800,
      }),
    );
    render(
      <ImageBlockContent
        block={image}
        imageHost={{ upload: vi.fn(), resolve, onRemoved: vi.fn() }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading image');
    const rendered = await screen.findByRole('img', { name: 'An open Bible' });
    expect(rendered).toHaveAttribute('src', 'https://example.com/bible.jpg');
    expect(screen.getByText('Morning study')).toBeInTheDocument();
  });

  it('exposes compact media actions and a quiet caption editor', () => {
    const onChange = vi.fn();
    render(
      <ImageBlockContent
        block={{ ...image, src: 'https://example.com/bible.jpg' }}
        editable
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Crop image' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: 'Crop image' })
        .closest('.scriptr-editor__context-toolbar'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand image' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Replace image file')).toHaveAttribute(
      'hidden',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Image settings' }));
    expect(
      screen.getByRole('dialog', { name: 'Image settings' }),
    ).toHaveAttribute('data-scriptr-ui');
    fireEvent.change(screen.getByLabelText('Alternative text'), {
      target: { value: 'An annotated Bible' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ alt: 'An annotated Bible' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crop image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Square' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cropRatio: 'square' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit caption' }));
    fireEvent.change(screen.getByLabelText('Image caption'), {
      target: { value: 'Updated caption' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: [{ type: 'text', text: 'Updated caption' }],
      }),
    );
  });
});

describe('ImageUploader', () => {
  it('lets the host validate and upload with progress', async () => {
    const validate = vi.fn();
    const upload: ImageHost['upload'] = vi.fn((input: ImageUploadInput) => {
      const { onProgress } = input;
      onProgress?.(0.5);
      return Promise.resolve({
        assetId: 'asset-2',
        src: 'https://example.com/upload.jpg',
        width: 640,
        height: 480,
      });
    });
    const onUploaded = vi.fn();
    render(
      <ImageUploader
        createBlockId={() => 'image-2'}
        imageHost={{ validate, upload, resolve: vi.fn(), onRemoved: vi.fn() }}
        onUploaded={onUploaded}
      />,
    );
    const file = new File(['image'], 'study.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose image'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(validate).toHaveBeenCalledWith(file);
    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'image-2', assetId: 'asset-2' }),
    );
  });

  it('shows host failures and retries the selected image', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('Image quota reached.'))
      .mockResolvedValueOnce({
        assetId: 'asset-3',
        src: 'https://example.com/retry.jpg',
        width: 640,
        height: 480,
      });
    const onUploaded = vi.fn();
    render(
      <ImageUploader
        createBlockId={() => 'image-3'}
        imageHost={{ upload, resolve: vi.fn(), onRemoved: vi.fn() }}
        onUploaded={onUploaded}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose image'), {
      target: {
        files: [new File(['image'], 'study.png', { type: 'image/png' })],
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image quota reached.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
