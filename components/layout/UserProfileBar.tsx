'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useAppStore } from '@/store';
import { updateProfile } from '@/members/actions';
import { getInitials } from '@/shared/lib/utils';
import { LogOut, User, SmilePlus, ChevronLeft } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PopoverView = 'menu' | 'status' | 'profile';

/**
 * User profile bar displayed at the bottom of the channel sidebar.
 * Shows avatar, name, status emoji. Popover with status, profile, and sign out actions.
 */
export function UserProfileBar() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PopoverView>('menu');

  // Status form state
  const [statusEmoji, setStatusEmoji] = useState('');
  const [statusText, setStatusText] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  if (!user) return null;

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setView('menu');
    }
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
    } finally {
      setStatusSaving(false);
    }
  };

  const handleClearStatus = async () => {
    setStatusSaving(true);
    try {
      const updated = await updateProfile({
        statusEmoji: '',
        statusText: '',
      });
      setUser({
        ...user,
        statusEmoji: updated.statusEmoji,
        statusText: updated.statusText,
      });
      setView('menu');
    } catch (err) {
      console.error('Failed to clear status:', err);
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
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' });
  };

  return (
    <div className="border-t px-3 py-2 shrink-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors text-left"
          >
            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center text-xs font-medium shrink-0">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name ?? ''}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                getInitials(user.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-medium">
                  {user.name || 'User'}
                </span>
                {user.statusEmoji && (
                  <span className="text-xs">{user.statusEmoji}</span>
                )}
              </div>
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
