/**
 * calls/lib/iceConfig.ts
 *
 * Builds the RTCConfiguration used by all WebRTC peer connections.
 * Always includes Google STUN servers for NAT traversal on the same network.
 * Optionally adds a TURN relay server for cross-network communication
 * (symmetric NAT, corporate firewalls, etc.).
 *
 * Configure via environment variables:
 *   NEXT_PUBLIC_TURN_URL        — e.g. "turn:turn.example.com:3478"
 *   NEXT_PUBLIC_TURN_USERNAME   — coturn username
 *   NEXT_PUBLIC_TURN_CREDENTIAL — coturn password
 */

function buildIceConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername || undefined,
      credential: turnCredential || undefined,
    });
  }

  return { iceServers };
}

export const ICE_CONFIG: RTCConfiguration = buildIceConfig();
