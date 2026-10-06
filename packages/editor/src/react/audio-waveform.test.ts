import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioPeaks, loadAudioPeaks } from './audio-waveform.js';

afterEach(() => vi.unstubAllGlobals());

describe('audio waveform samples', () => {
  it('preserves silence and the actual relative peaks across the entire file', () => {
    expect(audioPeaks([new Float32Array([0, 0, 0.25, -0.5, 1, 0])], 3)).toEqual(
      [0, 0.5, 1],
    );
  });
  it('includes every channel without cancelling opposite-phase stereo', () => {
    expect(
      audioPeaks([new Float32Array([0.5, 0]), new Float32Array([-0.5, 1])], 2),
    ).toEqual([0.5, 1]);
  });
  it('handles short, empty and silent data without inventing amplitudes', () => {
    expect(audioPeaks([new Float32Array([0.5])], 3)).toEqual([0.5, 0.5, 0.5]);
    expect(audioPeaks([], 3)).toEqual([0, 0, 0]);
    expect(audioPeaks([new Float32Array(7)], 3)).toEqual([0, 0, 0]);
  });
  it('fetches and decodes the requested source, including the other channels', async () => {
    const fetchSource = vi.fn(() =>
      Promise.resolve(new Response(new Uint8Array([1, 2]))),
    );
    const decode = vi.fn(() =>
      Promise.resolve({
        numberOfChannels: 2,
        getChannelData: (channel: number) =>
          new Float32Array(channel ? [0, 1] : [0.5, 0]),
      }),
    );
    vi.stubGlobal('fetch', fetchSource);
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = decode;
      },
    );
    const controller = new AbortController();
    const peaks = await loadAudioPeaks(
      'https://example.com/audio.wav',
      controller.signal,
    );
    expect(fetchSource).toHaveBeenCalledWith('https://example.com/audio.wav', {
      signal: controller.signal,
    });
    expect(decode).toHaveBeenCalledOnce();
    expect(peaks[0]).toBe(0.5);
    expect(peaks.at(-1)).toBe(1);
  });
  it('rejects fetch failure and an aborted request rather than inventing bars', async () => {
    vi.stubGlobal('OfflineAudioContext', class {});
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    await expect(
      loadAudioPeaks(
        'https://example.com/audio.wav',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadAudioPeaks('https://example.com/audio.wav', controller.signal),
    ).rejects.toThrow();
  });
});
