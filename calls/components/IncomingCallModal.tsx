/**
 * calls/components/IncomingCallModal.tsx
 *
 * Modal overlay shown when there is an incoming call.
 * Shows caller avatar/name, call type badge, and accept/decline buttons.
 * CSS ring animation on the avatar. Auto-dismisses after 30 seconds.
 *
 * Usage:
 *   <IncomingCallModal onAccept={acceptCall} onDecline={declineCall} />
 */

'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff } from 'lucide-react';
import { useCallStore } from '@/calls/store';
import { modalVariants, backdropVariants, springSnappy, tapScale } from '@/shared/lib/animations';

const AUTO_DISMISS_MS = 30_000;

interface IncomingCallModalProps {
  onAccept: (callId: string) => void;
  onDecline: (callId: string) => void;
}

export function IncomingCallModal({ onAccept, onDecline }: IncomingCallModalProps) {
  const incomingCall = useCallStore((s) => s.incomingCall);
  const clearIncomingCall = useCallStore((s) => s.clearIncomingCall);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 30s
  useEffect(() => {
    if (!incomingCall) return;

    timerRef.current = setTimeout(() => {
      clearIncomingCall();
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [incomingCall, clearIncomingCall]);

  return (
    <AnimatePresence>
      {incomingCall && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={backdropVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal card */}
          <motion.div
            className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl bg-zinc-900 p-8 shadow-2xl"
            variants={modalVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Caller avatar with ring animation */}
            <div className="relative">
              {/* Pulsing ring layers */}
              <div className="absolute inset-0 animate-ping rounded-full bg-green-500/30" />
              <div
                className="absolute inset-0 animate-ping rounded-full bg-green-500/20"
                style={{ animationDelay: '0.3s' }}
              />

              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-zinc-700 text-3xl font-bold text-white ring-4 ring-green-500">
                {incomingCall.callerName.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Caller info */}
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-lg font-semibold text-white">{incomingCall.callerName}</p>
              <span className="rounded-full bg-zinc-800 px-3 py-0.5 text-xs font-medium text-zinc-400">
                {incomingCall.type === '1:1' ? '📞 Voice call' : '🎧 Huddle invite'}
              </span>
            </div>

            {/* Accept / Decline buttons */}
            <div className="flex gap-6">
              {/* Decline */}
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  onClick={() => onDecline(incomingCall.callId)}
                  whileHover={{ scale: 1.08 }}
                  whileTap={tapScale}
                  transition={springSnappy}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
                  aria-label="Decline call"
                >
                  <PhoneOff className="h-6 w-6" />
                </motion.button>
                <span className="text-xs text-zinc-500">Decline</span>
              </div>

              {/* Accept */}
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  onClick={() => onAccept(incomingCall.callId)}
                  whileHover={{ scale: 1.08 }}
                  whileTap={tapScale}
                  transition={springSnappy}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700"
                  aria-label="Accept call"
                >
                  <Phone className="h-6 w-6" />
                </motion.button>
                <span className="text-xs text-zinc-500">Accept</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
