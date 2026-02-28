/**
 * calls/hooks/useMediaDevices.ts
 *
 * Enumerates available cameras, microphones, and speakers via
 * navigator.mediaDevices.enumerateDevices(). Listens for devicechange events
 * so the list stays fresh when devices are plugged/unplugged.
 *
 * Usage:
 *   const { cameras, microphones, speakers, selectDevice } = useMediaDevices()
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useCallStore } from '@/calls/store';

export interface UseMediaDevicesReturn {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedCamera: string | null;
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
  selectDevice: (type: 'camera' | 'microphone' | 'speaker', deviceId: string) => void;
  refreshDevices: () => Promise<void>;
}

/**
 * Reads and tracks available media input/output devices.
 * Device labels require the user to have granted camera/microphone permission
 * at least once; before that, labels will be empty strings.
 */
export function useMediaDevices(): UseMediaDevicesReturn {
  const {
    mediaDevices,
    setMediaDevices,
    setSelectedDevice,
  } = useCallStore();

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();

      const cameras = allDevices.filter((d) => d.kind === 'videoinput');
      const microphones = allDevices.filter((d) => d.kind === 'audioinput');
      const speakers = allDevices.filter((d) => d.kind === 'audiooutput');

      setMediaDevices({ cameras, microphones, speakers });

      // Auto-select defaults if nothing selected yet
      const store = useCallStore.getState();
      if (!store.mediaDevices.selectedCameraId && cameras.length > 0) {
        setSelectedDevice('camera', cameras[0].deviceId);
      }
      if (!store.mediaDevices.selectedMicrophoneId && microphones.length > 0) {
        setSelectedDevice('microphone', microphones[0].deviceId);
      }
      if (!store.mediaDevices.selectedSpeakerId && speakers.length > 0) {
        setSelectedDevice('speaker', speakers[0].deviceId);
      }
    } catch (err) {
      console.error('[useMediaDevices] enumerateDevices failed:', err);
    }
  }, [setMediaDevices, setSelectedDevice]);

  useEffect(() => {
    refreshDevices();

    const handleDeviceChange = () => {
      refreshDevices();
    };

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [refreshDevices]);

  return {
    cameras: mediaDevices.cameras,
    microphones: mediaDevices.microphones,
    speakers: mediaDevices.speakers,
    selectedCamera: mediaDevices.selectedCameraId,
    selectedMicrophone: mediaDevices.selectedMicrophoneId,
    selectedSpeaker: mediaDevices.selectedSpeakerId,
    selectDevice: setSelectedDevice,
    refreshDevices,
  };
}
