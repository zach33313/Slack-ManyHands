/**
 * calls/hooks/useWebRTC.ts
 *
 * Core React hook wrapping simple-peer for WebRTC peer connections.
 * Creates a single peer connection for 1:1 calls.
 * For group huddles, use useHuddle which manages multiple peers.
 *
 * Usage:
 *   const { peer, remoteStream, connected, error } = useWebRTC({
 *     initiator: true,
 *     stream: localStream,
 *     signalCallback: (signal) => emitCallSignal(socket, callId, toUserId, signal),
 *   })
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { ICE_CONFIG } from '@/calls/lib/iceConfig';

export interface UseWebRTCConfig {
  /** Whether this end creates the WebRTC offer (true for caller) */
  initiator: boolean;
  /** Local media stream to send to the remote peer */
  stream: MediaStream | null;
  /** Called whenever a new ICE candidate or SDP signal is generated */
  signalCallback: (signal: SimplePeer.SignalData) => void;
}

export interface UseWebRTCReturn {
  /** The underlying simple-peer instance (null before stream is ready) */
  peer: SimplePeer.Instance | null;
  /** Remote peer's media stream, available after WebRTC connection */
  remoteStream: MediaStream | null;
  /** Whether the WebRTC data channel is fully connected */
  connected: boolean;
  /** Any peer connection error */
  error: Error | null;
}

/**
 * Creates and manages a single simple-peer connection.
 * Automatically destroyed on unmount or when stream changes.
 */
export function useWebRTC(config: UseWebRTCConfig): UseWebRTCReturn {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const signalCallbackRef = useRef(config.signalCallback);
  signalCallbackRef.current = config.signalCallback;

  useEffect(() => {
    if (!config.stream) return;

    // Destroy any existing peer before creating a new one
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    const peer = new SimplePeer({
      initiator: config.initiator,
      trickle: true,
      stream: config.stream,
      config: ICE_CONFIG,
    });

    peer.on('signal', (data: SimplePeer.SignalData) => {
      signalCallbackRef.current(data);
    });

    peer.on('stream', (stream: MediaStream) => {
      setRemoteStream(stream);
    });

    peer.on('connect', () => {
      setConnected(true);
      setError(null);
    });

    peer.on('close', () => {
      setConnected(false);
      setRemoteStream(null);
    });

    peer.on('error', (err: Error) => {
      setError(err);
      setConnected(false);
    });

    peerRef.current = peer;

    return () => {
      peer.destroy();
      peerRef.current = null;
      setConnected(false);
      setRemoteStream(null);
    };
  }, [config.stream, config.initiator]);

  return {
    peer: peerRef.current,
    remoteStream,
    connected,
    error,
  };
}
