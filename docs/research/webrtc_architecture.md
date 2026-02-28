# WebRTC Calling Architecture: Simple-Peer + Socket.IO Research

**Date**: February 2026
**Project**: Stock Anomaly Detection Platform (Feature Addition)
**Scope**: 1:1 calls, group huddles (2-6 participants), screen sharing, audio detection

---

## Executive Summary

This document provides architecture recommendations for implementing WebRTC calling with **simple-peer 9.11.1** over **Socket.IO 4.x** signaling. The design supports:
- 1:1 direct peer calls with clean state management
- Group huddles (2-6 participants) using mesh topology
- Screen sharing via `getDisplayMedia()`
- Audio level visualization with Web Audio API
- Media device enumeration and selection
- Persistent floating call window across route navigation

**Key Recommendation**: Use simple-peer for low-complexity P2P connections (≤6 participants) with Socket.IO rooms for signaling. This minimizes server infrastructure while supporting our huddle use case.

---

## 1. Core Library Selection

### RECOMMENDATION: Simple-Peer 9.11.1 (with security patch awareness)

**Why simple-peer over alternatives:**
- **Lightweight**: ~7KB minified, minimal bundle impact
- **Mature & Stable**: Core WebRTC wrapper, "done" state with 7,774 GitHub stars
- **Direct Control**: Exposes RTCPeerConnection for advanced features
- **Community Support**: 175K+ weekly npm downloads
- **Test-Proven**: Used in production calling apps

**Important Note**: Official simple-peer is at v9.11.1 (2020). Maintained fork available at `@thaunknown/simple-peer@10.0.12` if you need recent patches.

### INSTALLATION

```bash
npm install simple-peer@9.11.1
# Or for maintained fork with recent updates:
npm install @thaunknown/simple-peer@10.0.12
```

### USAGE EXAMPLE: Basic Peer Connection

```javascript
import SimplePeer from 'simple-peer';

// Initiator creates offer
const initiatorPeer = new SimplePeer({
  initiator: true,
  trickleICE: true,
  stream: localStream, // from getUserMedia()
});

// ICE candidates as they arrive
initiatorPeer.on('signal', (data) => {
  // Send to signaling server (Socket.IO)
  socket.emit('signal', {
    to: recipientId,
    signal: data,
  });
});

// Non-initiator waits for signal
const responderPeer = new SimplePeer({
  initiator: false,
  trickleICE: true,
  stream: localStream,
});

responderPeer.on('signal', (data) => {
  socket.emit('signal', {
    to: initiatorId,
    signal: data,
  });
});

// Receive and process signals
socket.on('signal', (message) => {
  peer.signal(message.signal);
});

// Connection ready
peer.on('connect', () => {
  console.log('WebRTC connection established');
});

// Receive stream from peer
peer.on('stream', (remoteStream) => {
  remoteVideoElement.srcObject = remoteStream;
});
```

### INTEGRATION NOTES

- **Stream Management**: Pass `getUserMedia()` stream at peer creation; update via `addTrack()`/`removeTrack()` for screen share switching
- **Trickle ICE**: Set `trickleICE: true` for better connection speed (candidates sent as available, not waiting for gathering)
- **Error Handling**: Listen to `error` and `close` events; implement reconnection logic via signaling server
- **Multiple Peers**: For group calls, maintain a `Map<peerId, SimplePeer>` to manage multiple simultaneous connections

### ALTERNATIVES CONSIDERED

1. **PeerJS (13,165 GH stars)** - Higher-level wrapper with built-in server infrastructure
   - Pro: Simplest API, handles signaling server
   - Con: Less control, requires hosted PeerServer or self-hosted server
   - **Why not**: Extra abstraction layer; our Socket.IO signaling is simpler

2. **MediaSoup (7,056 GH stars)** - Full SFU media server
   - Pro: Scales to 50+ participants, server-side media processing
   - Con: Heavy infrastructure, overkill for 2-6 person huddles
   - **Why not**: Over-engineered for huddle feature; better for 10+ users

3. **Raw WebRTC API** - Native browser RTCPeerConnection
   - Pro: Maximum control, zero dependencies
   - Con: Verbose signal handling, candidate trickle complexity
   - **Why not**: simple-peer eliminates boilerplate while maintaining flexibility

---

## 2. Signaling Architecture: Socket.IO Integration

### RECOMMENDATION: Socket.IO 4.x with Room-Based Namespaces

Use Socket.IO **rooms** for lightweight call groups, **namespaces** for feature isolation.

### INSTALLATION

```bash
npm install socket.io-client@4.x
# Backend already has socket.io@4.x
```

### USAGE EXAMPLE: Signaling Server Pattern

```javascript
// Backend: routes/signaling.js
const express = require('express');
const { Server } = require('socket.io');

const io = new Server(app, {
  cors: { origin: 'http://localhost:5173', credentials: true },
});

// Signaling namespace for call-related events
const signalingNamespace = io.of('/calling');

signalingNamespace.on('connection', (socket) => {
  // User initiates call
  socket.on('call:initiate', ({ targetUserId, callId }) => {
    socket.join(`call:${callId}`);
    signalingNamespace.to(`user:${targetUserId}`).emit('call:incoming', {
      callId,
      fromUserId: socket.data.userId,
      timestamp: Date.now(),
    });
  });

  // User accepts call
  socket.on('call:accept', ({ callId }) => {
    socket.join(`call:${callId}`);
    signalingNamespace.to(`call:${callId}`).emit('call:accepted', {
      userId: socket.data.userId,
    });
  });

  // Exchange WebRTC signals (ICE candidates, offer/answer)
  socket.on('signal', ({ to, signal, callId }) => {
    signalingNamespace
      .to(`user:${to}`)
      .emit('signal', {
        from: socket.data.userId,
        signal,
        callId,
      });
  });

  // User declines or ends call
  socket.on('call:end', ({ callId }) => {
    signalingNamespace.to(`call:${callId}`).emit('call:ended', {
      userId: socket.data.userId,
    });
    socket.leave(`call:${callId}`);
  });

  // User disconnects
  socket.on('disconnect', () => {
    signalingNamespace.emit('user:offline', {
      userId: socket.data.userId,
    });
  });
});
```

### USAGE EXAMPLE: Client Signaling

```javascript
// Frontend: hooks/useWebRTCSignaling.js
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export function useWebRTCSignaling(userId) {
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to signaling namespace
    socketRef.current = io('http://localhost:8000/calling', {
      auth: { userId },
    });

    // Listen for incoming calls
    socketRef.current.on('call:incoming', ({ callId, fromUserId }) => {
      // Trigger UI: show incoming call dialog
    });

    // Listen for signal events
    socketRef.current.on('signal', ({ from, signal, callId }) => {
      // Pass to SimplePeer: peer.signal(signal)
    });

    return () => socketRef.current.disconnect();
  }, [userId]);

  return socketRef.current;
}
```

### INTEGRATION NOTES

- **Rooms**: One room per call (e.g., `call:${callId}`) ensures messages only reach participants
- **Namespace Isolation**: Keep `/calling` separate from other real-time features
- **Exponential Backoff**: Socket.IO auto-reconnects; configure `reconnection: true` (default)
- **Binary Protocol**: Use default text messages for signaling (lightweight)
- **Authentication**: Validate `userId` at connection; store in `socket.data`

### ALTERNATIVES CONSIDERED

1. **Raw WebSocket + Custom Protocol**
   - Pro: Minimal overhead
   - Con: No auto-reconnection, fallback handling, or binary support
   - **Why not**: Socket.IO handles these gracefully

2. **HTTP REST Polling** (signaling only)
   - Pro: Stateless, easy to scale
   - Con: High latency for time-sensitive offer/answer exchange
   - **Why not**: Socket.IO ~50ms lower latency

3. **WebRTC DataChannels** (peer-to-peer signaling)
   - Pro: Direct peer communication
   - Con: Chicken-egg problem (need established connection to signal)
   - **Why not**: Only viable for secondary signaling after peer connection

---

## 3. Call State Machine Design

### RECOMMENDATION: React Context with useReducer for State Management

Implement a clean state machine: `IDLE → RINGING → CONNECTING → CONNECTED → ENDED`

### USAGE EXAMPLE: Call State Reducer

```javascript
// contexts/CallContext.jsx
import { createContext, useReducer, useCallback } from 'react';

export const CallContext = createContext();

const initialState = {
  // Call metadata
  callId: null,
  callType: 'call' | 'huddle', // or 'screen' for screen share
  state: 'IDLE', // IDLE | RINGING | CONNECTING | CONNECTED | ENDED
  initiator: false,

  // Participants
  localUserId: null,
  participants: {}, // { userId: { id, name, stream, state, isMuted, isCameraOff } }

  // Timing
  startTime: null,
  duration: 0,

  // Error handling
  error: null,
};

function callReducer(state, action) {
  switch (action.type) {
    case 'INITIATE_CALL':
      return {
        ...state,
        callId: action.callId,
        callType: action.callType,
        state: 'RINGING',
        initiator: true,
        participants: {
          [action.targetUserId]: {
            id: action.targetUserId,
            name: action.targetName,
            state: 'RINGING',
            stream: null,
          },
        },
      };

    case 'ACCEPT_CALL':
      return {
        ...state,
        state: 'CONNECTING',
        initiator: false,
      };

    case 'PEER_CONNECTED':
      return {
        ...state,
        state: 'CONNECTED',
        startTime: Date.now(),
        participants: {
          ...state.participants,
          [action.userId]: {
            ...state.participants[action.userId],
            state: 'CONNECTED',
            stream: action.stream,
          },
        },
      };

    case 'ADD_PARTICIPANT':
      return {
        ...state,
        participants: {
          ...state.participants,
          [action.userId]: {
            id: action.userId,
            name: action.name,
            state: 'CONNECTING',
            stream: null,
            isMuted: false,
            isCameraOff: false,
          },
        },
      };

    case 'UPDATE_PARTICIPANT':
      return {
        ...state,
        participants: {
          ...state.participants,
          [action.userId]: {
            ...state.participants[action.userId],
            ...action.updates,
          },
        },
      };

    case 'END_CALL':
      return {
        ...state,
        state: 'ENDED',
        participants: {},
        callId: null,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.error,
        state: 'ENDED',
      };

    default:
      return state;
  }
}

export function CallProvider({ children }) {
  const [callState, dispatch] = useReducer(callReducer, initialState);

  const initiateCall = useCallback((targetUserId, targetName) => {
    const callId = `call_${Date.now()}_${Math.random().toString(36)}`;
    dispatch({
      type: 'INITIATE_CALL',
      callId,
      callType: 'call',
      targetUserId,
      targetName,
    });
    return callId;
  }, []);

  const endCall = useCallback(() => {
    dispatch({ type: 'END_CALL' });
  }, []);

  return (
    <CallContext.Provider
      value={{
        state: callState,
        dispatch,
        initiateCall,
        endCall,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

// Hook for using call state
export function useCall() {
  const context = React.useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within CallProvider');
  }
  return context;
}
```

### STATE TRANSITIONS

```
IDLE (initial)
  ↓ (user clicks "call")
RINGING (waiting for peer to accept)
  ├─ (rejected) → IDLE/ENDED
  └─ (accepted) → CONNECTING
      ↓ (peers exchange SDP/ICE)
      CONNECTED (media flowing)
        ├─ (user hangs up) → ENDED
        └─ (connection drops) → IDLE/ENDED
```

### INTEGRATION NOTES

- **Lift State Up**: Place `CallProvider` at root level (above routing) so call persists across navigation
- **Dispatch Events**: Each state change triggers via reducer action (explicit state flow)
- **Participant Tracking**: Store all participants' streams, mute states, camera states in one object
- **Timing**: Auto-increment `duration` with `setInterval` for call timer display

---

## 4. Mesh Topology for Group Huddles (2-6 Participants)

### RECOMMENDATION: Mesh Topology with Per-Peer SimplePeer Instances

For huddles up to 6 people, direct mesh (each peer connects to all others) provides lowest latency and zero server media processing.

### USAGE EXAMPLE: Mesh Connection Manager

```javascript
// hooks/useMeshConnections.js
import { useEffect, useRef, useCallback } from 'react';
import SimplePeer from 'simple-peer';

export function useMeshConnections(
  localUserId,
  localStream,
  remoteParticipants,
  onRemoteStream
) {
  // Map of userId → SimplePeer instance
  const peersRef = useRef(new Map());

  // Track peer states
  const peerStatesRef = useRef(new Map());

  // Create or recreate peer connections when participants change
  useEffect(() => {
    remoteParticipants.forEach((remoteUserId) => {
      if (peersRef.current.has(remoteUserId)) {
        return; // Already connected
      }

      // Determine if we're the initiator (lower ID initiates)
      const isInitiator = localUserId < remoteUserId;

      const peer = new SimplePeer({
        initiator: isInitiator,
        trickleICE: true,
        stream: localStream,
      });

      // Emit signal events to signaling server
      peer.on('signal', (signal) => {
        socket.emit('signal', {
          to: remoteUserId,
          from: localUserId,
          signal,
        });
      });

      // When connection established
      peer.on('connect', () => {
        console.log(`Connected to ${remoteUserId}`);
        peerStatesRef.current.set(remoteUserId, 'CONNECTED');
      });

      // Receive remote stream
      peer.on('stream', (stream) => {
        onRemoteStream(remoteUserId, stream);
      });

      // Error handling
      peer.on('error', (err) => {
        console.error(`Peer error with ${remoteUserId}:`, err);
        peerStatesRef.current.set(remoteUserId, 'ERROR');
      });

      // Cleanup on close
      peer.on('close', () => {
        console.log(`Disconnected from ${remoteUserId}`);
        peersRef.current.delete(remoteUserId);
        peerStatesRef.current.delete(remoteUserId);
      });

      peersRef.current.set(remoteUserId, peer);
      peerStatesRef.current.set(remoteUserId, 'CONNECTING');
    });

    // Cleanup peers not in participants list
    peersRef.current.forEach((peer, userId) => {
      if (!remoteParticipants.includes(userId)) {
        peer.destroy();
        peersRef.current.delete(userId);
        peerStatesRef.current.delete(userId);
      }
    });
  }, [remoteParticipants, localStream, localUserId, onRemoteStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peersRef.current.forEach((peer) => peer.destroy());
      peersRef.current.clear();
    };
  }, []);

  return {
    peers: peersRef.current,
    peerStates: peerStatesRef.current,
  };
}
```

### HANDLING INCOMING SIGNALS

```javascript
// In the calling component or signaling handler
socket.on('signal', ({ from, signal }) => {
  const peer = peersRef.current.get(from);
  if (peer) {
    peer.signal(signal);
  }
});
```

### MESH TOPOLOGY LIMITATIONS & WORKAROUNDS

| Issue | Limit | Workaround |
|-------|-------|-----------|
| CPU usage | 4-6 peers max | Use SFU if growing beyond huddles |
| Bandwidth upstream | ~3 Mbps per person (6 Mbps at 2 Mbps/stream) | Cap video bitrate; offer audio-only mode |
| Battery drain | Noticeable on mobile | Reduce video frame rate (15fps) for huddles |
| Network instability | One bad peer drops all | Implement peer-specific reconnection logic |

### INTEGRATION NOTES

- **Initiator Selection**: Lower userId initiates to avoid both creating offer (race condition)
- **Trickle ICE**: Essential for mesh; wait for `'connect'` event before sending media
- **One Peer Per Remote**: Never create multiple SimplePeer instances for same remote user
- **Dynamic Participant Join**: On new participant, existing peers don't need recreation (only new peer joins)
- **Screen Share**: Swap stream tracks instead of recreating all peers (see section 5)

### ALTERNATIVES CONSIDERED

1. **SFU (Selective Forwarding Unit)** - Central media relay server
   - Pro: Scales to 10+ participants, flexible layouts
   - Con: Requires server infrastructure, ~50-100ms added latency
   - **Why not**: For 2-6 huddles, mesh lower latency and zero server cost

2. **MCU (Multipoint Control Unit)** - Composite mixing server
   - Pro: Single composite stream per participant
   - Con: Extreme server load, expensive
   - **Why not**: Overkill for huddles; requires re-encoding all streams

---

## 5. Screen Sharing with getDisplayMedia

### RECOMMENDATION: getDisplayMedia() with Track Replacement

Switch local stream tracks dynamically without recreating peer connections.

### USAGE EXAMPLE: Screen Share Manager

```javascript
// hooks/useScreenShare.js
import { useCallback, useRef } from 'react';

export function useScreenShare() {
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const startScreenShare = useCallback(async (peerConnections) => {
    try {
      // Capture screen with audio option (Windows/Chrome only)
      screenStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
        audio: false, // Audio sharing has platform limitations
      });

      const screenTrack = screenStreamRef.current.getVideoTracks()[0];

      // Replace video track in all peer connections
      for (const [userId, peer] of peerConnections) {
        const sender = peer._pc
          .getSenders()
          .find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
      }

      // Handle screen share stop (user clicks "Stop sharing" in browser UI)
      screenTrack.onended = () => {
        stopScreenShare(peerConnections);
      };

      return screenStreamRef.current;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        console.log('User denied screen share permission');
      } else if (err.name === 'NotFoundError') {
        console.log('No screen/window available to share');
      }
      throw err;
    }
  }, []);

  const stopScreenShare = useCallback(async (peerConnections, cameraStream) => {
    try {
      // Stop screen share track
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Restore camera video track
      const cameraTrack = cameraStream?.getVideoTracks()[0];
      if (cameraTrack) {
        for (const [userId, peer] of peerConnections) {
          const sender = peer._pc
            .getSenders()
            .find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(cameraTrack);
          }
        }
      }

      screenStreamRef.current = null;
    } catch (err) {
      console.error('Error stopping screen share:', err);
    }
  }, []);

  return {
    isScreenSharing: !!screenStreamRef.current,
    startScreenShare,
    stopScreenShare,
  };
}
```

### BROWSER SUPPORT & PLATFORM LIMITATIONS

| Platform | Video | Desktop Audio |
|----------|-------|----------------|
| Chrome/Edge (Windows) | ✓ | ✓ |
| Chrome/Edge (macOS) | ✓ | ✗ |
| Firefox (Windows) | ✓ | ✓ |
| Firefox (macOS) | ✓ | ✗ |
| Safari | ✓ | ✗ |

**Note**: Audio capture from desktop is Windows-only (Chrome, Firefox). macOS/Linux users must manually switch to screen share mode in their OS audio settings.

### INTEGRATION NOTES

- **HTTPS Required**: `getDisplayMedia()` only works on HTTPS or localhost
- **User Permission**: Browser always shows dialog; no way to bypass
- **Track Replacement**: Use `RTCRtpSender.replaceTrack()` (not `removeTrack/addTrack`) to avoid re-negotiation
- **Stream vs Track**: One screen stream, but replace the video track in multiple peers
- **Cursor Option**: Set `cursor: 'always'` to show cursor in screen share

### ALTERNATIVES CONSIDERED

1. **Canvas Capture** - Custom drawing/UI sharing
   - Pro: Share specific areas, include annotations
   - Con: High bandwidth, synchronization issues
   - **Why not**: `getDisplayMedia()` is simpler, user-friendly

2. **Iframe/DOM Recording** - Share web content
   - Pro: Exact pixel-perfect capture
   - Con: Violates frame security, won't work with videos/plug-ins
   - **Why not**: Not standard; `getDisplayMedia()` is the web standard

---

## 6. Audio Level Detection with Web Audio API

### RECOMMENDATION: AnalyserNode + RequestAnimationFrame

Real-time audio visualization for call quality indicators and talking detection.

### USAGE EXAMPLE: Audio Analyzer

```javascript
// hooks/useAudioAnalyzer.js
import { useEffect, useRef, useCallback } from 'react';

export function useAudioAnalyzer(stream) {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);
  const callbackRef = useRef(null);

  const initialize = useCallback((onLevel) => {
    if (audioContextRef.current) return; // Already initialized

    callbackRef.current = onLevel;

    // Create or resume audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Create nodes
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Window size for FFT
    analyser.smoothingTimeConstant = 0.8; // Smooth out rapid changes

    // Connect: stream → analyser → destination
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    // Start measuring
    measureAudioLevel();
  }, [stream]);

  const measureAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average frequency level (0-255)
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

    // Normalize to 0-1
    const normalizedLevel = average / 255;

    // Detect if user is talking (threshold > 0.1)
    const isTalking = normalizedLevel > 0.1;

    if (callbackRef.current) {
      callbackRef.current({
        level: normalizedLevel,
        isTalking,
        frequency: analyserRef.current.getFrequencyData?.() || dataArray,
      });
    }

    animationRef.current = requestAnimationFrame(measureAudioLevel);
  }, []);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  }, []);

  useEffect(() => {
    initialize((level) => {
      // callback
    });

    return cleanup;
  }, [stream, initialize, cleanup]);

  return {
    initialize,
    cleanup,
    audioContext: audioContextRef.current,
    analyser: analyserRef.current,
  };
}
```

### USAGE IN COMPONENT

```javascript
function CallParticipant({ userId, stream }) {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isTalking, setIsTalking] = useState(false);

  useAudioAnalyzer(stream);

  // Custom hook wrapper
  useEffect(() => {
    const { initialize } = useAudioAnalyzer(stream);
    initialize(({ level, isTalking }) => {
      setAudioLevel(level);
      setIsTalking(isTalking);
    });
  }, [stream]);

  return (
    <div className="participant">
      <video srcObject={stream} />

      {/* Audio level indicator */}
      <div className="audio-level" style={{
        height: `${audioLevel * 100}%`,
        backgroundColor: isTalking ? '#4ade80' : '#ef4444',
      }} />

      {isTalking && <span className="talking-badge">Speaking</span>}
    </div>
  );
}
```

### PERFORMANCE NOTES

- **FFT Size**: 2048 = 21.3ms precision (good for audio viz)
- **Frame Rate**: 60 FPS via `requestAnimationFrame` is smooth but may use 5-10% CPU
- **Memory**: 2KB per analyser; one per stream is fine
- **Audio Context Limit**: 6 concurrent contexts (browser limit); not an issue for 6 participants

### INTEGRATION NOTES

- **User Gesture**: Audio context requires user gesture (click) on some browsers; handle `NotAllowedError`
- **Mobile**: Microphone permissions required; request upfront
- **Frequency vs Time Domain**: Use `getByteFrequencyData()` for audio bars; use `getByteTimeDomainData()` for waveforms
- **Talking Detection**: Threshold around 0.1 (10% of max frequency) works well for filtering silence

### ALTERNATIVES CONSIDERED

1. **getUserMedia() volume property** - Native browser measurement
   - Pro: No Web Audio setup needed
   - Con: Not available on all platforms; less accurate
   - **Why not**: Web Audio API is more reliable and flexible

2. **FFmpeg-based analysis** - Server-side audio processing
   - Pro: Offload from client CPU
   - Con: Adds network latency, complex server setup
   - **Why not**: Client-side Real-time analysis needed for live visualization

---

## 7. Media Device Enumeration & Selection

### RECOMMENDATION: enumerateDevices() + Constraints API

Allow users to select camera, microphone, and speaker devices before/during calls.

### USAGE EXAMPLE: Device Selector

```javascript
// hooks/useMediaDevices.js
import { useState, useEffect, useCallback } from 'react';

export function useMediaDevices() {
  const [devices, setDevices] = useState({
    audioinput: [],
    videoinput: [],
    audiooutput: [],
  });

  const [selectedDevices, setSelectedDevices] = useState({
    audioinput: null,  // Device ID
    videoinput: null,  // Device ID
    audiooutput: null, // Device ID
  });

  // Enumerate all media devices
  const enumerateDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();

      const devicesByKind = {
        audioinput: [],
        videoinput: [],
        audiooutput: [],
      };

      allDevices.forEach((device) => {
        if (devicesByKind[device.kind]) {
          devicesByKind[device.kind].push({
            deviceId: device.deviceId,
            groupId: device.groupId,
            label: device.label || `${device.kind} ${devicesByKind[device.kind].length + 1}`,
            kind: device.kind,
          });
        }
      });

      setDevices(devicesByKind);

      // Auto-select first device of each kind
      setSelectedDevices({
        audioinput: devicesByKind.audioinput[0]?.deviceId || null,
        videoinput: devicesByKind.videoinput[0]?.deviceId || null,
        audiooutput: devicesByKind.audiooutput[0]?.deviceId || null,
      });
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, []);

  // Get media stream with constraints
  const getStream = useCallback(
    async (constraints = {}) => {
      try {
        const mediaConstraints = {
          audio: {
            deviceId: selectedDevices.audioinput
              ? { exact: selectedDevices.audioinput }
              : undefined,
          },
          video: {
            deviceId: selectedDevices.videoinput
              ? { exact: selectedDevices.videoinput }
              : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          ...constraints,
        };

        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        return stream;
      } catch (err) {
        console.error('Error getting user media:', err);
        if (err.name === 'NotAllowedError') {
          throw new Error('Microphone/camera permission denied');
        } else if (err.name === 'NotFoundError') {
          throw new Error('No microphone or camera found');
        }
        throw err;
      }
    },
    [selectedDevices]
  );

  // Listen for device changes (plug/unplug headset, etc.)
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);

    // Initial enumeration
    enumerateDevices();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
    };
  }, [enumerateDevices]);

  return {
    devices,
    selectedDevices,
    setSelectedDevices,
    getStream,
    enumerateDevices,
  };
}
```

### DEVICE SELECTOR UI

```javascript
function DeviceSettings() {
  const { devices, selectedDevices, setSelectedDevices } = useMediaDevices();

  return (
    <div className="device-settings">
      <label>
        Microphone:
        <select
          value={selectedDevices.audioinput || ''}
          onChange={(e) =>
            setSelectedDevices({
              ...selectedDevices,
              audioinput: e.target.value,
            })
          }
        >
          {devices.audioinput.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Camera:
        <select
          value={selectedDevices.videoinput || ''}
          onChange={(e) =>
            setSelectedDevices({
              ...selectedDevices,
              videoinput: e.target.value,
            })
          }
        >
          {devices.videoinput.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Speaker:
        <select
          value={selectedDevices.audiooutput || ''}
          onChange={(e) =>
            setSelectedDevices({
              ...selectedDevices,
              audiooutput: e.target.value,
            })
          }
        >
          {devices.audiooutput.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

### INTEGRATION NOTES

- **Permissions**: Must request `getUserMedia()` before seeing device labels (security)
- **Device Changes**: Listen to `devicechange` event for plug/unplug detection
- **Group ID**: Devices with same `groupId` are same physical device (e.g., webcam + mic)
- **Constraints**: Use `{ exact: deviceId }` for specific device; omit for any device
- **Fallback**: If selected device disconnects, fall back to first available device
- **Speaker Selection**: Supported in Chrome 94+; older browsers ignore `audiooutput` constraint

### ALTERNATIVES CONSIDERED

1. **getUserMedia() with facingMode** - Front vs back camera selection (mobile)
   - Pro: Works on all devices automatically
   - Con: Can't select between multiple front cameras
   - **Combine with**: Use facingMode for mobile, deviceId for desktop

2. **Audio context setSinkId()** - Route audio to specific speaker
   - Pro: Post-connection speaker switch
   - Con: Limited browser support
   - **Why not**: Enumerate + constraint-based selection more reliable

---

## 8. Floating Call Window Persistence Across Navigation

### RECOMMENDATION: Root-Level CallProvider + Portal-Based UI

Keep call state at app root; render call UI via Portal outside route tree.

### ARCHITECTURE DIAGRAM

```
App Root
├── CallProvider (state persists across routes)
│   ├── Router
│   │   ├── Route: Dashboard
│   │   ├── Route: Settings
│   │   └── Route: Contacts
│   │
│   └── Portals (rendered outside router)
│       ├── FloatingCallWindow (always visible)
│       └── CallDialog (incoming call)
```

### USAGE EXAMPLE: Root Layout Structure

```javascript
// App.jsx
import { CallProvider } from '@/contexts/CallContext';
import { FloatingCallWindow } from '@/components/FloatingCallWindow';
import { IncomingCallDialog } from '@/components/IncomingCallDialog';
import Router from '@/router';

export default function App() {
  return (
    <CallProvider>
      {/* Main app routes */}
      <Router />

      {/* Floating UI - outside router, persists across navigation */}
      <div id="floating-ui-portal">
        <FloatingCallWindow />
        <IncomingCallDialog />
      </div>
    </CallProvider>
  );
}
```

### USAGE EXAMPLE: Floating Call Window

```javascript
// components/FloatingCallWindow.jsx
import { useCall } from '@/contexts/CallContext';
import { createPortal } from 'react-dom';

export function FloatingCallWindow() {
  const { state: callState } = useCall();

  // Only render if call is active
  if (!callState.callId || callState.state === 'IDLE' || callState.state === 'ENDED') {
    return null;
  }

  const content = (
    <div className="floating-window">
      <div className="floating-header">
        <h3>
          {callState.callType === 'huddle'
            ? `Huddle (${Object.keys(callState.participants).length + 1})`
            : `Call with ${Object.values(callState.participants)[0]?.name}`}
        </h3>
        <span className="call-timer">{formatDuration(callState.duration)}</span>
      </div>

      <div className="floating-video-grid">
        {/* Local video */}
        <video
          id="local-video"
          autoPlay
          muted
          playsInline
          className="local-video"
        />

        {/* Remote videos */}
        {Object.entries(callState.participants).map(([userId, participant]) => (
          <div key={userId} className="remote-video">
            <video
              autoPlay
              playsInline
              srcObject={participant.stream}
            />
            {participant.isMuted && <span className="muted-badge">🔇</span>}
          </div>
        ))}
      </div>

      <div className="floating-controls">
        <button
          onClick={() => toggleMute()}
          className={callState.participants[localUserId]?.isMuted ? 'active' : ''}
        >
          🎤
        </button>
        <button
          onClick={() => toggleCamera()}
          className={callState.participants[localUserId]?.isCameraOff ? 'active' : ''}
        >
          📹
        </button>
        <button onClick={() => endCall()}>
          🔴 End
        </button>
      </div>
    </div>
  );

  // Portal to render outside router
  return createPortal(content, document.getElementById('floating-ui-portal'));
}
```

### KEY IMPLEMENTATION DETAILS

1. **CallProvider at Root**
   - Place `CallProvider` above `Router` in component tree
   - Ensures `callState` persists across route changes
   - Never re-mount the provider during navigation

2. **Portal for UI**
   - Use React `createPortal()` to render floating window outside router
   - Target a DOM node (e.g., `<div id="floating-ui-portal">`) at root
   - Floating window unmounts/remounts with routes, but state persists in context

3. **Muting/Camera Toggle**
   - Track per-participant mute state in context
   - Update local media tracks in real-time:
     ```javascript
     const toggleMute = () => {
       localStream?.getAudioTracks().forEach(track => {
         track.enabled = !track.enabled;
       });
       dispatch({ type: 'UPDATE_PARTICIPANT', userId: localUserId, updates: { isMuted: !isMuted } });
     };
     ```

4. **Call Timer**
   - Use `setInterval` in effect to increment `duration` every second
   - Place interval setup in call state manager, not component
   - Clear interval on unmount

### INTEGRATION NOTES

- **Don't Unmount CallProvider**: If you wrap it lower (inside route), state resets on navigation
- **Portal Container**: Add `<div id="floating-ui-portal"></div>` to `index.html` before app root
- **Z-Index**: Set floating window z-index high (e.g., `9999`) to appear above all content
- **Dragging**: Use `react-draggable` or custom mouse handlers for repositionable window
- **Screen Share Preview**: Show screen share fullscreen overlay instead of grid when sharing

### ALTERNATIVES CONSIDERED

1. **URL-Based Call State** - Store callId in URL query param
   - Pro: Shareable call links
   - Con: Fragile; navigation resets state if not persisted to server
   - **Use alongside**: Save callState to backend on changes for recovery

2. **Service Worker** - Background media processing
   - Pro: Calls continue if tab closes
   - Con: Complex; limited WebRTC support in SW
   - **Why not**: For MVP, in-tab persistence sufficient

3. **Separate Window/Tab** - Open call in new window
   - Pro: Isolation, independent lifecycle
   - Con: Cross-tab communication complexity
   - **Why not**: Single-window floating UI simpler and sufficient

---

## 9. Implementation Checklist

- [ ] Install dependencies: `npm install simple-peer socket.io-client`
- [ ] Set up SignallingNamespace in backend (socket.io routes)
- [ ] Create `CallContext` with reducer for state machine
- [ ] Create `CallProvider` component; place at app root
- [ ] Implement `useMeshConnections` hook for managing SimplePeer instances
- [ ] Build `FloatingCallWindow` component with Portal
- [ ] Add incoming call dialog (`IncomingCallDialog`)
- [ ] Implement `useScreenShare` hook with `getDisplayMedia()`
- [ ] Add `useAudioAnalyzer` hook with AnalyserNode
- [ ] Build device selector UI with `enumerateDevices()`
- [ ] Add call duration timer
- [ ] Test with 2, 3, and 6 participants to verify mesh topology limits
- [ ] Test screen share on Windows, macOS, and Linux
- [ ] Test device plug/unplug (headset connection/disconnection)
- [ ] Verify call window persists across route navigation
- [ ] Error handling: network failures, permission denials, device unavailable

---

## 10. Performance & Scaling Recommendations

| Metric | Target | Notes |
|--------|--------|-------|
| **Connection Time** | <3s | Offer/answer + ICE gathering + DTLS |
| **Video Bitrate** | 1.5 Mbps @ 720p | Adjust based on network |
| **Audio Bitrate** | 32-64 kbps | Opus codec, adaptive |
| **Mesh Max** | 6 participants | Beyond this, use SFU |
| **Audio Latency** | <150ms | Perceived as real-time |
| **Frame Rate** | 30 fps @ 720p | 24 fps acceptable; 15 fps for bandwidth-limited |
| **CPU Usage** | <25% per peer | Monitor with DevTools Performance tab |

### Scaling Beyond Huddles

If calling feature expands beyond huddles:
1. **5-10 participants** → Hybrid mesh+SFU (mesh for 2-3, SFU for others)
2. **10+ participants** → Pure SFU (use [LiveKit](https://livekit.io/) or [Mediasoup](https://mediasoup.org/))

---

## 11. Security Considerations

1. **HTTPS Mandatory** - `getDisplayMedia()`, auth, credentials all require HTTPS
2. **Signaling Validation** - Validate incoming `signal` events; check `from` matches sender
3. **Media Stream Handling** - Never store streams in non-ephemeral storage (avoid localStorage)
4. **Permission Requests** - Request camera/mic only when needed (before call UI)
5. **CORS Configuration** - Ensure Socket.IO CORS restricted to expected origins
6. **CallId Randomization** - Use cryptographically strong random IDs for calls (avoid predictable)

---

## 12. Testing Strategy

### Unit Tests
- State reducer transitions (IDLE → RINGING → CONNECTED)
- Audio analyzer level calculations
- Device enumeration filtering

### Integration Tests
- Full 1:1 call flow (initiate → accept → connected → end)
- 3-person huddle formation
- Screen share start/stop
- Device changes during call

### Manual Tests
- Network disconnection recovery
- Permission denial handling
- Device not found fallback
- Call persistence across route navigation (navigate to settings while call active, verify audio/video continues)

---

## Summary: Technology Stack

| Component | Library | Version | Justification |
|-----------|---------|---------|---------------|
| **WebRTC Peer** | simple-peer | 9.11.1 | Lightweight, mature, full control |
| **Signaling** | Socket.IO | 4.x | Auto-reconnection, fallbacks, rooms |
| **State Management** | React Context + useReducer | N/A | Minimal deps, call state per-app |
| **UI Framework** | React | 18+ | Already in use; Portal for floating UI |
| **Audio Analysis** | Web Audio API | Browser native | No deps, real-time capable |
| **Screen Share** | getDisplayMedia() | Browser native | Standard, no deps |
| **Device Selection** | MediaDevices API | Browser native | Enumerate + constraints |

---

## Research Sources

- [simple-peer - npm](https://www.npmjs.com/package/simple-peer)
- [GitHub - feross/simple-peer](https://github.com/feross/simple-peer)
- [Best Practices for Socket.io and WebRTC Integration](https://www.dhiwise.com/post/a-comprehensive-guide-to-integrating-socket-io-with-webrtc)
- [Socket.IO Rooms Documentation](https://socket.io/docs/v4/rooms/)
- [Mesh vs SFU vs MCU: WebRTC Network Topology](https://antmedia.io/webrtc-network-topology/)
- [Anatomy of a WebRTC Connection](https://www.webrtc-developers.com/anatomy-of-a-webrtc-connection/)
- [AnalyserNode - MDN Web APIs](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [Web Audio API Visualizations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API)
- [Using the Screen Capture API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture)
- [MediaDevices.enumerateDevices() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
- [WebRTC Library Comparison 2024](https://www.javaspring.net/blog/current-state-of-javascript-webrtc-libraries/)
- [Managing Multiple WebRTC Peer Connections](https://medium.com/@meetdianacheung/how-to-handle-multiple-webrtc-peer-connections-in-a-single-client-e316c452aad9)
- [Socket.IO Rooms for Real-Time Apps](https://www.videosdk.live/developer-hub/socketio/socketio-rooms)

