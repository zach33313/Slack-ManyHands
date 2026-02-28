'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store';
import { useSocket } from '@/shared/hooks/useSocket';
import type { Workspace, ChannelWithMeta, UserSummary } from '@/shared/types';

interface WorkspaceHydratorProps {
  workspace: Workspace;
  channels: ChannelWithMeta[];
  workspaces: Workspace[];
  dmParticipants: Record<string, UserSummary[]>;
  userId: string;
}

/**
 * Invisible client component that hydrates the Zustand store with
 * server-fetched workspace data. Also joins the Socket.IO workspace room.
 */
export function WorkspaceHydrator({
  workspace,
  channels,
  workspaces,
  dmParticipants,
  userId,
}: WorkspaceHydratorProps) {
  const setUser = useAppStore((s) => s.setUser);
  const setCurrentWorkspace = useAppStore((s) => s.setCurrentWorkspace);
  const setChannels = useAppStore((s) => s.setChannels);
  const setWorkspaces = useAppStore((s) => s.setWorkspaces);
  const setDmParticipants = useAppStore((s) => s.setDmParticipants);
  const socket = useSocket();
  const prevWorkspaceId = useRef<string | null>(null);

  // Hydrate store from server data — only re-run when workspace ID changes,
  // not on every render (props are new object references each time)
  useEffect(() => {
    setUser({
      id: userId,
      name: '',
      email: '',
      image: null,
      title: null,
      statusText: null,
      statusEmoji: null,
      timezone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setCurrentWorkspace(workspace);
    setChannels(channels);
    setWorkspaces(workspaces);
    setDmParticipants(dmParticipants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  // Fetch real user profile data on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/users/${userId}/profile`);
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (body.ok && body.data && !cancelled) {
          setUser({
            id: body.data.id,
            name: body.data.name ?? '',
            email: body.data.email ?? '',
            image: body.data.image ?? null,
            title: body.data.title ?? null,
            statusText: body.data.statusText ?? null,
            statusEmoji: body.data.statusEmoji ?? null,
            timezone: body.data.timezone ?? null,
            createdAt: new Date(body.data.createdAt),
            updatedAt: new Date(body.data.updatedAt),
          });
        }
      } catch {
        // Silently fail — user store already has basic data
      }
    }
    fetchProfile();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Join workspace room on mount / workspace change
  useEffect(() => {
    if (workspace.id !== prevWorkspaceId.current) {
      socket.emit('workspace:join', { workspaceId: workspace.id });
      prevWorkspaceId.current = workspace.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  // Emit presence heartbeat every 30 seconds
  useEffect(() => {
    socket.emit('presence:heartbeat');
    const interval = setInterval(() => {
      socket.emit('presence:heartbeat');
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
