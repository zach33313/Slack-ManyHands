/**
 * calls/hooks/useAudioLevel.ts
 *
 * Measures real-time audio level (0–1) from a MediaStream using
 * the Web Audio API AnalyserNode + requestAnimationFrame.
 * Used for active-speaker detection and audio level visualizers.
 *
 * Usage:
 *   const audioLevel = useAudioLevel(stream)
 *   // audioLevel: 0–1 float, updated every animation frame
 */

'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Returns a real-time audio level (0–1) from the given MediaStream.
 * Returns 0 when no stream is provided or in SSR.
 */
export function useAudioLevel(stream: MediaStream | null | undefined): number {
  const [level, setLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream || typeof window === 'undefined') {
      setLevel(0);
      return;
    }

    // Only attach if there are audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      return;
    }

    let cancelled = false;

    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      setLevel(0);
      return;
    }

    try {
      const audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      // Do NOT connect to destination — avoid echo feedback

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;
      dataArrayRef.current = dataArray;

      const measure = () => {
        if (cancelled) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate RMS-like average over frequency bins
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(average / 128, 1); // Normalize to 0–1

        setLevel(normalized);
        rafRef.current = requestAnimationFrame(measure);
      };

      rafRef.current = requestAnimationFrame(measure);
    } catch (err) {
      console.error('[useAudioLevel] Web Audio API error:', err);
    }

    return () => {
      cancelled = true;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      sourceRef.current?.disconnect();
      sourceRef.current = null;

      analyserRef.current = null;
      dataArrayRef.current = null;

      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;

      setLevel(0);
    };
  }, [stream]);

  return level;
}
