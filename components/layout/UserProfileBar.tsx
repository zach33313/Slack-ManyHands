'use client';

import { useState, useEffect, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { updateProfile, setDND, getDNDStatus } from '@/members/actions';
import { getInitials } from '@/shared/lib/utils';
import {
  LogOut,
  User,
  SmilePlus,
  ChevronLeft,
  Moon,
  MoonStar,
  BellOff,
  Sun,
  Clock,
  Calendar,
  Palette,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/shared/lib/utils';
import { ThemePicker } from '@/components/ThemePicker';

type PopoverView = 'menu' | 'status' | 'profile' | 'dnd' | 'appearance';

const DND_DURATIONS = [
  { label: 'For 30 minutes', minutes: 30 },
  { label: 'For 1 hour', minutes: 60 },
  { label: 'For 2 hours', minutes: 120 },
  { label: 'Until tomorrow 9am', minutes: null, label2: 'tomorrow' },
  { label: 'Until I turn it off', minutes: -1 },
] as const;

function getTomorrowNineAm(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Returns true when the DND end date is the "until turned off" sentinel (year ≥ 2099). */
function isDndIndefinite(date: Date): boolean {
  return date.getFullYear() >= 2099;
}

/**
 * User profile bar displayed at the bottom of the channel sidebar.
 * Shows avatar, name, status emoji. Popover with status, profile, DND, and sign out actions.
 * Includes Do Not Disturb mode with duration picker.
 */
export function UserProfileBar() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PopoverView>('menu');

  // DND state
  const [dndUntil, setDndUntil] = useState<Date | null>(null);
  const [dndSaving, setDndSaving] = useState(false);
  const [customDndDate, setCustomDndDate] = useState('');

  // Status form state
  const [statusEmoji, setStatusEmoji] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Load user's DND status from the server on mount so it survives page reloads.
  // The Zustand store user object does not include dndUntil (not serialized by the
  // layout server component), so we must fetch it directly.
  useEffect(() => {
    if (!user?.id) return;
    getDNDStatus()
      .then((until) => {
        if (until) setDndUntil(until);
      })
      .catch(() => {
        // Non-fatal — DND indicator simply won't show until the user interacts
      });
  }, [user?.id]);

  // Check if DND is still active on a timer.
  // Indefinite DND (sentinel year ≥ 2099) must be cleared manually — no timer set.
  // Regular durations use setTimeout; values above ~24.8 days (2^31-1 ms) would
  // overflow the 32-bit delay and fire immediately, but all fixed durations are well
  // within that range.
  useEffect(() => {
    if (!dndUntil) return;
    if (isDndIndefinite(dndUntil)) return; // cleared only via "Turn off" button
    const ms = dndUntil.getTime() - Date.now();
    if (ms <= 0) {
      setDndUntil(null);
      return;
    }
    const timer = setTimeout(() => setDndUntil(null), ms);
    return () => clearTimeout(timer);
  }, [dndUntil]);

  const isDNDActive = dndUntil !== null && dndUntil > new Date();

  const handleSetDND = useCallback(async (until: Date | null) => {
    setDndSaving(true);
    try {
      await setDND(until);
      setDndUntil(until);
      setView('menu');
    } catch (err) {
      console.error('Failed to set DND:', err);
    } finally {
      setDndSaving(false);
    }
  }, []);

  const handleToggleDND = useCallback(() => {
    if (isDNDActive) {
      // Immediately turn off when already active — clear intent, no picker needed
      handleSetDND(null);
    } else {
      // Open the popover to the DND duration picker so the user can choose
      setOpen(true);
      setView('dnd');
    }
  }, [isDNDActive, handleSetDND]);

  if (!user) return null;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) setView('menu');
  };

  const openStatusView = () => {
    setStatusEmoji(user.statusEmoji ?? '');
    setStatusText(user.statusText ?? '');
    setView('status');
  };

  const openProfileView = () => {
    setProfileName(user.name ?? '');
    setProfileTitle(user.title ?? '');
    setProfileTimezone(user.timezone ?? '');
    setView('profile');
  };

  const handleSaveStatus = async () => {
    setStatusSaving(true);
    try {
      const updated = await updateProfile({
        statusEmoji: statusEmoji || undefined,
        statusText: statusText || undefined,
      });
      setUser({
        ...user,
        statusEmoji: updated.statusEmoji,
        statusText: updated.statusText,
      });
      setView('menu');
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleClearStatus = async () => {
    setStatusSaving(true);
    try {
      const updated = await updateProfile({ statusEmoji: '', statusText: '' });
      setUser({
        ...user,
        statusEmoji: updated.statusEmoji,
        statusText: updated.statusText,
      });
      setView('menu');
    } catch (err) {
      console.error('Failed to clear status:', err);
      toast.error('Failed to clear status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      const updated = await updateProfile({
        displayName: profileName || undefined,
        title: profileTitle || undefined,
        timezone: profileTimezone || undefined,
      });
      setUser({
        ...user,
        name: updated.name ?? user.name,
        title: updated.title,
        timezone: updated.timezone,
      });
      setView('menu');
    } catch (err) {
      console.error('Failed to update profile:', err);
      toast.error('Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  const dndLabel = isDNDActive && dndUntil
    ? isDndIndefinite(dndUntil)
      ? 'DND until turned off'
      : `DND until ${dndUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Do Not Disturb';

  return (
    <div className="border-t px-3 py-2 shrink-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left">
            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-xs font-medium shrink-0 relative">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name ?? ''}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                getInitials(user.name)
              )}
              {/* DND indicator */}
              {isDNDActive && (
                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-background flex items-center justify-center">
                  <Moon className="h-2.5 w-2.5 text-orange-500" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-medium">{user.name || 'User'}</span>
                {user.statusEmoji && <span className="text-xs">{user.statusEmoji}</span>}
                {isDNDActive && (
                  <span className="ml-auto text-xs text-orange-500 shrink-0">
                    <MoonStar className="h-3 w-3" />
                  </span>
                )}
              </div>
              {isDNDActive && (
                <div className="text-[10px] text-orange-500 truncate">Do Not Disturb</div>
              )}
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent side="top" align="start" className="w-64 p-0">
          {view === 'menu' && (
            <div className="p-2 space-y-0.5">
              {/* User info header */}
              <div className="px-2 py-2 mb-1">
                <div className="font-medium text-sm">{user.name || 'User'}</div>
                {user.statusText && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {user.statusEmoji} {user.statusText}
                  </div>
                )}
                {isDNDActive && dndUntil && (
                  <div className="text-xs text-orange-500 mt-0.5 flex items-center gap-1">
                    <Moon className="h-3 w-3" />
                    {isDndIndefinite(dndUntil)
                      ? 'DND until turned off'
                      : `DND until ${dndUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                )}
              </div>

              <button
                onClick={openStatusView}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <SmilePlus className="h-4 w-4 text-muted-foreground" />
                Set status
              </button>
              <button
                onClick={openProfileView}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Edit profile
              </button>

              {/* DND toggle */}
              <button
                onClick={() => setView('dnd')}
                className={cn(
                  'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left',
                  isDNDActive && 'text-orange-500'
                )}
              >
                {isDNDActive ? (
                  <BellOff className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                {dndLabel}
              </button>

              {/* Appearance / themes */}
              <button
                onClick={() => setView('appearance')}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
              >
                <Palette className="h-4 w-4 text-muted-foreground" />
                Appearance
              </button>

              <div className="border-t my-1" />
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}

          {view === 'dnd' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setView('menu')}>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <h4 className="font-medium text-sm">Do Not Disturb</h4>
              </div>

              {isDNDActive && dndUntil && (
                <div className="text-xs text-orange-500 flex items-center gap-1 bg-orange-50 dark:bg-orange-950/20 rounded-md px-2 py-1.5">
                  <Moon className="h-3 w-3 shrink-0" />
                  {isDndIndefinite(dndUntil)
                    ? 'Active until turned off'
                    : `Active until ${dndUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                </div>
              )}

              <div className="space-y-0.5">
                {isDNDActive ? (
                  <button
                    onClick={() => handleSetDND(null)}
                    disabled={dndSaving}
                    className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left text-orange-500"
                  >
                    <Sun className="h-4 w-4" />
                    Turn off Do Not Disturb
                  </button>
                ) : null}

                <div className="text-xs text-muted-foreground px-2 pt-1 pb-0.5 font-medium">
                  Set a duration:
                </div>

                {DND_DURATIONS.map((dur, i) => {
                  const getUntil = () => {
                    if (dur.minutes === -1) return new Date('2099-12-31'); // Far future = until turned off
                    if (dur.minutes === null) return getTomorrowNineAm();
                    return new Date(Date.now() + dur.minutes * 60 * 1000);
                  };
                  return (
                    <button
                      key={i}
                      onClick={() => handleSetDND(getUntil())}
                      disabled={dndSaving}
                      className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                      {dur.minutes === null ? (
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      {dur.label}
                    </button>
                  );
                })}

                {/* Custom date/time input */}
                <div className="pt-2">
                  <label className="text-xs text-muted-foreground px-2">Custom end time:</label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="datetime-local"
                      value={customDndDate}
                      onChange={(e) => setCustomDndDate(e.target.value)}
                      className="flex-1 text-xs rounded border px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary"
                    />
                    <Button
                      size="sm"
                      disabled={!customDndDate || dndSaving}
                      onClick={() => {
                        if (customDndDate) handleSetDND(new Date(customDndDate));
                      }}
                    >
                      Set
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'status' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setView('menu')}>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <h4 className="font-medium text-sm">Set status</h4>
              </div>

              <div className="flex gap-2">
                <Input
                  value={statusEmoji}
                  onChange={(e) => setStatusEmoji(e.target.value)}
                  placeholder="Emoji"
                  className="w-16 text-center"
                  maxLength={4}
                />
                <Input
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="What's your status?"
                  className="flex-1"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveStatus}
                  disabled={statusSaving}
                  className="flex-1"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearStatus}
                  disabled={statusSaving}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {view === 'profile' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setView('menu')}>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <h4 className="font-medium text-sm">Edit profile</h4>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-xs text-muted-foreground">Display name</label>
                  <Input
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Title</label>
                  <Input
                    value={profileTitle}
                    onChange={(e) => setProfileTitle(e.target.value)}
                    placeholder="e.g. Software Engineer"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Timezone</label>
                  <Input
                    value={profileTimezone}
                    onChange={(e) => setProfileTimezone(e.target.value)}
                    placeholder="e.g. America/New_York"
                  />
                </div>
              </div>

              <Button
                size="sm"
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="w-full"
              >
                Save
              </Button>
            </div>
          )}

          {view === 'appearance' && (
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setView('menu')}>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <h4 className="font-medium text-sm">Appearance</h4>
              </div>
              <ThemePicker />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
