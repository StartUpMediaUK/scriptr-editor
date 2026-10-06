import { useEffect, useState } from 'react';
import { loadAudioPeaks } from './audio-waveform.js';

type Waveform = {
  readonly source: string;
  readonly status: 'ready' | 'unavailable';
  readonly peaks: readonly number[];
};

export function useAudioWaveform(source: string | undefined) {
  const [waveform, setWaveform] = useState<Waveform>();
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    void loadAudioPeaks(source, controller.signal).then(
      (peaks) => {
        if (!controller.signal.aborted)
          setWaveform({ source, status: 'ready', peaks });
      },
      () => {
        if (!controller.signal.aborted)
          setWaveform({ source, status: 'unavailable', peaks: [] });
      },
    );
    return () => controller.abort();
  }, [source]);
  return waveform?.source === source
    ? waveform
    : { status: 'loading' as const, peaks: [] };
}
