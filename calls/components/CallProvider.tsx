/**
 * calls/components/CallProvider.tsx
 *
 * Root context provider for all call and huddle features.
 * Place this high in the component tree (ideally in app/layout.tsx) so that
 * the FloatingCallWindow persists across route navigation.
 *
 * - Initializes useCall() and useHuddle() hooks globally
 * - Renders FloatingCallWindow when activeCall exists
 * - Renders IncomingCallModal when incomingCall exists
 *
 * Usage (in app/layout.tsx):
 *   <CallProvider>
 *     {children}
 *   </CallProvider>
 */

'use client';

import { createContext, useContext } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useCallStore } from '@/calls/store';
import { useCall } from '@/calls/hooks/useCall';
import { useHuddle } from '@/calls/hooks/useHuddle';
import { FloatingCallWindow } from './FloatingCallWindow';
import { IncomingCallModal } from './IncomingCallModal';
import type { UseCallReturn } from '@/calls/hooks/useCall';
import type { UseHuddleReturn } from '@/calls/hooks/useHuddle';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CallContextValue extends UseCallReturn, Pick<UseHuddleReturn, 'joinHuddle' | 'leaveHuddle'> {}

const CallContext = createContext<CallContextValue | null>(null);

export function useCallContext(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCallContext must be used within <CallProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface CallProviderProps {
  children: React.ReactNode;
}

/**
 * Inner component that mounts hooks (must be client component inside provider).
 */
function CallProviderInner({ children }: CallProviderProps) {
  const { startCall, acceptCall, declineCall, hangup, toggleMedia } = useCall();
  const { joinHuddle, leaveHuddle } = useHuddle();

  const activeCall = useCallStore((s) => s.activeCall);

  const contextValue: CallContextValue = {
    startCall,
    acceptCall,
    declineCall,
    hangup,
    toggleMedia,
    joinHuddle,
    leaveHuddle,
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}

      {/* Global overlays — rendered outside the page content so they persist across navigation */}
      <AnimatePresence>
        {activeCall && (
          <FloatingCallWindow
            key="floating-call"
            onHangup={hangup}
            onToggleMute={() => toggleMedia('audio')}
            onToggleCamera={() => toggleMedia('video')}
            onToggleScreenShare={() => toggleMedia('screen')}
          />
        )}
      </AnimatePresence>

      <IncomingCallModal
        onAccept={acceptCall}
        onDecline={declineCall}
      />
    </CallContext.Provider>
  );
}

/**
 * Exported provider wrapper.
 * Must be rendered inside SessionProvider (next-auth) and SocketProvider.
 */
export function CallProvider({ children }: CallProviderProps) {
  return <CallProviderInner>{children}</CallProviderInner>;
}
