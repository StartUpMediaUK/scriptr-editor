/** Peak envelope over equal time intervals; retain silence and stereo transients. */
export function audioPeaks(
  channels: readonly Float32Array[],
  count = 54,
): number[] {
  const length = channels[0]?.length ?? 0;
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * length) / count);
    const end = Math.min(
      length,
      Math.max(start + 1, Math.floor(((index + 1) * length) / count)),
    );
    let peak = 0;
    for (const channel of channels) {
      for (let sample = start; sample < end; sample += 1) {
        const value = Math.abs(channel[sample] ?? 0);
        if (Number.isFinite(value)) peak = Math.max(peak, value);
      }
    }
    return peak;
  });
}

/** Decode without opening an audio output device or changing playback. */
export async function loadAudioPeaks(
  source: string,
  signal: AbortSignal,
): Promise<number[]> {
  signal.throwIfAborted();
  if (typeof OfflineAudioContext === 'undefined')
    throw new Error('Audio analysis unavailable');
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error('Audio analysis fetch failed');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const context = new OfflineAudioContext(1, 1, 44_100);
  const buffer = await context.decodeAudioData(bytes);
  signal.throwIfAborted();
  return audioPeaks(
    Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel),
    ),
  );
}
