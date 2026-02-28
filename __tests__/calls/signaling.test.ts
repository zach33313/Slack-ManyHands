/**
 * Tests for calls/lib/signaling.ts
 *
 * Covers all Socket.IO emit wrappers for call and huddle signaling:
 * - emitCallInitiate / emitCallAccept / emitCallDecline / emitCallHangup
 * - emitCallSignal / emitCallToggleMedia
 * - emitHuddleJoin / emitHuddleLeave / emitHuddleSignal / emitHuddleToggleMedia
 */

import {
  emitCallInitiate,
  emitCallAccept,
  emitCallDecline,
  emitCallHangup,
  emitCallSignal,
  emitCallToggleMedia,
  emitHuddleJoin,
  emitHuddleLeave,
  emitHuddleSignal,
  emitHuddleToggleMedia,
} from '@/calls/lib/signaling';
import type { AppSocket } from '@/shared/lib/socket-client';

// ---------------------------------------------------------------------------
// Mock socket
// ---------------------------------------------------------------------------

function makeMockSocket(): jest.Mocked<Pick<AppSocket, 'emit'>> & { emit: jest.Mock } {
  return { emit: jest.fn() } as any;
}

// ---------------------------------------------------------------------------
// Call signaling
// ---------------------------------------------------------------------------

describe('Call signaling helpers', () => {
  let socket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    socket = makeMockSocket();
  });

  describe('emitCallInitiate', () => {
    it('emits call:initiate with channelId and type', () => {
      emitCallInitiate(socket as any, 'ch-1', '1:1');
      expect(socket.emit).toHaveBeenCalledWith('call:initiate', {
        channelId: 'ch-1',
        type: '1:1',
      });
    });

    it('emits call:initiate with huddle type', () => {
      emitCallInitiate(socket as any, 'ch-2', 'huddle');
      expect(socket.emit).toHaveBeenCalledWith('call:initiate', {
        channelId: 'ch-2',
        type: 'huddle',
      });
    });

    it('emits exactly once', () => {
      emitCallInitiate(socket as any, 'ch-1', '1:1');
      expect(socket.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitCallAccept', () => {
    it('emits call:accept with callId', () => {
      emitCallAccept(socket as any, 'call-abc');
      expect(socket.emit).toHaveBeenCalledWith('call:accept', { callId: 'call-abc' });
    });

    it('uses the provided callId', () => {
      emitCallAccept(socket as any, 'call-xyz');
      expect(socket.emit).toHaveBeenCalledWith('call:accept', { callId: 'call-xyz' });
    });
  });

  describe('emitCallDecline', () => {
    it('emits call:decline with callId', () => {
      emitCallDecline(socket as any, 'call-abc');
      expect(socket.emit).toHaveBeenCalledWith('call:decline', { callId: 'call-abc' });
    });
  });

  describe('emitCallHangup', () => {
    it('emits call:hangup with callId', () => {
      emitCallHangup(socket as any, 'call-abc');
      expect(socket.emit).toHaveBeenCalledWith('call:hangup', { callId: 'call-abc' });
    });
  });

  describe('emitCallSignal', () => {
    it('emits call:signal with callId, toUserId, and signal', () => {
      const signal = { type: 'offer', sdp: 'v=0...' };
      emitCallSignal(socket as any, 'call-abc', 'user-2', signal);
      expect(socket.emit).toHaveBeenCalledWith('call:signal', {
        callId: 'call-abc',
        toUserId: 'user-2',
        signal,
      });
    });

    it('passes signal opaquely without inspection', () => {
      const signal = { type: 'candidate', candidate: 'candidate:...' };
      emitCallSignal(socket as any, 'call-1', 'user-3', signal);
      const call = socket.emit.mock.calls[0];
      expect(call[1].signal).toBe(signal);
    });
  });

  describe('emitCallToggleMedia', () => {
    it('emits call:toggle-media with mute and camera state', () => {
      emitCallToggleMedia(socket as any, 'call-abc', true, false);
      expect(socket.emit).toHaveBeenCalledWith('call:toggle-media', {
        callId: 'call-abc',
        isMuted: true,
        isCameraOn: false,
      });
    });

    it('emits with unmuted and camera on state', () => {
      emitCallToggleMedia(socket as any, 'call-abc', false, true);
      expect(socket.emit).toHaveBeenCalledWith('call:toggle-media', {
        callId: 'call-abc',
        isMuted: false,
        isCameraOn: true,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Huddle signaling
// ---------------------------------------------------------------------------

describe('Huddle signaling helpers', () => {
  let socket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    socket = makeMockSocket();
  });

  describe('emitHuddleJoin', () => {
    it('emits huddle:join with channelId', () => {
      emitHuddleJoin(socket as any, 'ch-1');
      expect(socket.emit).toHaveBeenCalledWith('huddle:join', { channelId: 'ch-1' });
    });

    it('emits exactly once', () => {
      emitHuddleJoin(socket as any, 'ch-1');
      expect(socket.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitHuddleLeave', () => {
    it('emits huddle:leave with channelId', () => {
      emitHuddleLeave(socket as any, 'ch-1');
      expect(socket.emit).toHaveBeenCalledWith('huddle:leave', { channelId: 'ch-1' });
    });
  });

  describe('emitHuddleSignal', () => {
    it('emits huddle:signal with channelId, toUserId, and signal', () => {
      const signal = { type: 'answer', sdp: 'v=0...' };
      emitHuddleSignal(socket as any, 'ch-1', 'user-2', signal);
      expect(socket.emit).toHaveBeenCalledWith('huddle:signal', {
        channelId: 'ch-1',
        toUserId: 'user-2',
        signal,
      });
    });

    it('passes signal reference through without modification', () => {
      const signal = { type: 'candidate' };
      emitHuddleSignal(socket as any, 'ch-1', 'user-2', signal);
      const emitted = socket.emit.mock.calls[0][1];
      expect(emitted.signal).toBe(signal);
    });
  });

  describe('emitHuddleToggleMedia', () => {
    it('emits huddle:toggle-media with muted state', () => {
      emitHuddleToggleMedia(socket as any, 'ch-1', true, false);
      expect(socket.emit).toHaveBeenCalledWith('huddle:toggle-media', {
        channelId: 'ch-1',
        isMuted: true,
        isCameraOn: false,
      });
    });

    it('emits huddle:toggle-media with camera on state', () => {
      emitHuddleToggleMedia(socket as any, 'ch-1', false, true);
      expect(socket.emit).toHaveBeenCalledWith('huddle:toggle-media', {
        channelId: 'ch-1',
        isMuted: false,
        isCameraOn: true,
      });
    });

    it('passes the correct channelId', () => {
      emitHuddleToggleMedia(socket as any, 'ch-special', false, true);
      const emitted = socket.emit.mock.calls[0][1];
      expect(emitted.channelId).toBe('ch-special');
    });
  });
});
