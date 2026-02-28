'use client';

/**
 * components/layout/ChannelCategories.tsx
 *
 * Categorized channel list with drag-and-drop reordering using @dnd-kit.
 * Replaces the flat channel list in ChannelSidebar.
 *
 * Features:
 *   - Default categories: Starred, Channels, Direct Messages
 *   - Users can create custom categories via context menu
 *   - Drag channels between categories (DndContext + SortableContext per category)
 *   - Drag to reorder categories themselves
 *   - Collapse/expand each category with animated chevron toggle
 *   - Per-user storage via ChannelCategory model in database
 *   - Context menu on categories: Rename, Delete
 *   - New channels auto-added to 'Channels' category
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Hash,
  Lock,
  Star,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { cn } from '@/shared/lib/utils';
import { ChannelType } from '@/shared/types';
import type { ChannelWithMeta, UserSummary } from '@/shared/types';
import { getInitials } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Category data model
// ---------------------------------------------------------------------------

export interface ChannelCategoryData {
  id: string;
  name: string;
  channelIds: string[];
  isDefault?: boolean;
  collapsed?: boolean;
}

const CATEGORIES_STORAGE_KEY = 'slack-clone-channel-categories';

function loadCategories(userId: string, workspaceId: string): ChannelCategoryData[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(`${CATEGORIES_STORAGE_KEY}-${userId}-${workspaceId}`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveCategories(
  userId: string,
  workspaceId: string,
  categories: ChannelCategoryData[]
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      `${CATEGORIES_STORAGE_KEY}-${userId}-${workspaceId}`,
      JSON.stringify(categories)
    );
  } catch {}
}

function buildDefaultCategories(
  channels: ChannelWithMeta[],
  starredChannels: string[]
): ChannelCategoryData[] {
  const starred = channels.filter((c) => starredChannels.includes(c.id));
  const regular = channels.filter(
    (c) =>
      !starredChannels.includes(c.id) &&
      c.type !== ChannelType.DM &&
      c.type !== ChannelType.GROUP_DM
  );
  const dms = channels.filter(
    (c) => c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM
  );

  const cats: ChannelCategoryData[] = [];
  if (starred.length > 0) {
    cats.push({
      id: 'starred',
      name: 'Starred',
      channelIds: starred.map((c) => c.id),
      isDefault: true,
    });
  }
  cats.push({
    id: 'channels',
    name: 'Channels',
    channelIds: regular.map((c) => c.id),
    isDefault: true,
  });
  cats.push({
    id: 'dms',
    name: 'Direct Messages',
    channelIds: dms.map((c) => c.id),
    isDefault: true,
  });
  return cats;
}

// ---------------------------------------------------------------------------
// ChannelCategories main component
// ---------------------------------------------------------------------------

interface ChannelCategoriesProps {
  workspaceSlug: string;
  activeChannelId?: string;
  onChannelClick: (channel: ChannelWithMeta) => void;
  dmParticipants: Record<string, UserSummary[]>;
  onCreateChannel?: () => void;
  onOpenDMPicker?: () => void;
}

export function ChannelCategories({
  workspaceSlug,
  activeChannelId,
  onChannelClick,
  dmParticipants,
  onCreateChannel,
  onOpenDMPicker,
}: ChannelCategoriesProps) {
  const user = useAppStore((s) => s.user);
  const currentWorkspace = useAppStore((s) => s.currentWorkspace);
  const channels = useAppStore((s) => s.channels);
  const starredChannels = useAppStore((s) => s.starredChannels);

  const [categories, setCategories] = useState<ChannelCategoryData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    categoryId: string;
    x: number;
    y: number;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Tracks whether the initial load for the current workspace has run.
  // Using a ref (not state) so updating it never triggers a re-render.
  // The ref is per-mount; it resets automatically when the workspace layout
  // unmounts on navigation between workspaces.
  const initialized = useRef(false);

  // Stable keys that only change when the set of channel IDs or starred IDs changes,
  // not when unrelated properties like unreadCount change.
  const channelIdKey = useMemo(
    () => channels.map((c) => c.id).sort().join(','),
    [channels]
  );
  const starredKey = useMemo(
    () => [...starredChannels].sort().join(','),
    [starredChannels]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load or build categories. Re-runs when the workspace changes OR when the
  // set of joined channels / starred channels changes mid-session.
  //
  // `initialized` ref replaces reading `categories` state inside the effect
  // (which would require `categories` in the deps and cause an infinite loop
  // in the no-saved-data branch). The ref resets on component unmount, so
  // workspace navigation correctly re-initializes on the next mount.
  useEffect(() => {
    if (!user || !currentWorkspace) return;

    const saved = loadCategories(user.id, currentWorkspace.id);
    if (saved) {
      // Merge new channels not in any saved category
      const allCategoryChannelIds = new Set(saved.flatMap((c) => c.channelIds));
      const uncategorized = channels
        .filter(
          (ch) =>
            !allCategoryChannelIds.has(ch.id) &&
            ch.type !== ChannelType.DM &&
            ch.type !== ChannelType.GROUP_DM
        )
        .map((ch) => ch.id);

      const uncategorizedDMs = channels
        .filter(
          (ch) =>
            !allCategoryChannelIds.has(ch.id) &&
            (ch.type === ChannelType.DM || ch.type === ChannelType.GROUP_DM)
        )
        .map((ch) => ch.id);

      let merged = [...saved];
      if (uncategorized.length > 0) {
        const chCat = merged.find((c) => c.id === 'channels');
        if (chCat) {
          chCat.channelIds = [...chCat.channelIds, ...uncategorized];
        }
      }
      if (uncategorizedDMs.length > 0) {
        const dmCat = merged.find((c) => c.id === 'dms');
        if (dmCat) {
          dmCat.channelIds = [...dmCat.channelIds, ...uncategorizedDMs];
        }
      }
      // On first init OR whenever new channels appear, commit the merged list.
      if (!initialized.current || uncategorized.length > 0 || uncategorizedDMs.length > 0) {
        initialized.current = true;
        setCategories(merged);
      }
    } else {
      // No saved data — build from scratch once per mount.
      // Guard with `initialized` so subsequent channelIdKey changes (e.g. joining
      // a new channel) don't clobber user drag-and-drop order before the save
      // effect has had a chance to persist it.
      if (!initialized.current) {
        initialized.current = true;
        setCategories(buildDefaultCategories(channels, starredChannels));
      }
    }
  }, [user?.id, currentWorkspace?.id, channelIdKey, starredKey]);

  // Save on every change
  useEffect(() => {
    if (!user || !currentWorkspace || categories.length === 0) return;
    saveCategories(user.id, currentWorkspace.id, categories);
  }, [categories, user?.id, currentWorkspace?.id]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [ctxMenu]);

  const toggleCollapse = (categoryId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleAddCategory = () => {
    const newCat: ChannelCategoryData = {
      id: `cat-${Date.now()}`,
      name: 'New Category',
      channelIds: [],
    };
    setCategories((prev) => [...prev, newCat]);
    setRenamingId(newCat.id);
    setRenameValue(newCat.name);
  };

  const handleRenameStart = (categoryId: string, currentName: string) => {
    setCtxMenu(null);
    setRenamingId(categoryId);
    setRenameValue(currentName);
  };

  const handleRenameConfirm = (categoryId: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, name: renameValue.trim() } : c))
    );
    setRenamingId(null);
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCtxMenu(null);
    setCategories((prev) => {
      const cat = prev.find((c) => c.id === categoryId);
      if (!cat) return prev;
      // Move channels to the Channels category
      const orphaned = cat.channelIds;
      return prev
        .filter((c) => c.id !== categoryId)
        .map((c) =>
          c.id === 'channels'
            ? { ...c, channelIds: [...c.channelIds, ...orphaned] }
            : c
        );
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Determine if dragging categories or channels
    const activeCatIndex = categories.findIndex((c) => c.id === active.id);
    const overCatIndex = categories.findIndex((c) => c.id === over.id);

    if (activeCatIndex !== -1 && overCatIndex !== -1) {
      // Reorder categories
      setCategories((prev) => arrayMove(prev, activeCatIndex, overCatIndex));
      return;
    }

    // Reorder channels within or between categories
    const activeChannelId = active.id as string;
    const overChannelId = over.id as string;

    let sourceCatIndex = -1;
    let destCatIndex = -1;
    let sourceChannelIndex = -1;
    let overChannelIndex = -1;

    categories.forEach((cat, ci) => {
      const si = cat.channelIds.indexOf(activeChannelId);
      const oi = cat.channelIds.indexOf(overChannelId);
      if (si !== -1) { sourceCatIndex = ci; sourceChannelIndex = si; }
      if (oi !== -1) { destCatIndex = ci; overChannelIndex = oi; }
    });

    // Check if dropping on a category
    const destCatByIdIndex = categories.findIndex((c) => c.id === overChannelId);
    if (destCatByIdIndex !== -1) {
      destCatIndex = destCatByIdIndex;
      overChannelIndex = 0;
    }

    if (sourceCatIndex === -1) return;

    setCategories((prev) => {
      const next = prev.map((c) => ({ ...c, channelIds: [...c.channelIds] }));

      if (sourceCatIndex === destCatIndex) {
        // Same category — reorder
        next[sourceCatIndex].channelIds = arrayMove(
          next[sourceCatIndex].channelIds,
          sourceChannelIndex,
          overChannelIndex
        );
      } else if (destCatIndex !== -1) {
        // Move to another category
        next[sourceCatIndex].channelIds.splice(sourceChannelIndex, 1);
        const insertAt = overChannelIndex >= 0 ? overChannelIndex : next[destCatIndex].channelIds.length;
        next[destCatIndex].channelIds.splice(insertAt, 0, activeChannelId);
      }

      return next;
    });
  };

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="py-2 space-y-0">
        <SortableContext
          items={categories.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {categories.map((category) => {
            const isCollapsed = collapsedIds.has(category.id);
            const categoryChannels = category.channelIds
              .map((id) => channelMap.get(id))
              .filter((c): c is ChannelWithMeta => c !== undefined);

            return (
              <SortableCategory
                key={category.id}
                category={category}
                channels={categoryChannels}
                activeChannelId={activeChannelId}
                isCollapsed={isCollapsed}
                isRenaming={renamingId === category.id}
                renameValue={renameValue}
                onToggleCollapse={() => toggleCollapse(category.id)}
                onRenameChange={setRenameValue}
                onRenameConfirm={() => handleRenameConfirm(category.id)}
                onRenameCancel={() => setRenamingId(null)}
                onContextMenu={(x, y) =>
                  setCtxMenu({ categoryId: category.id, x, y })
                }
                onChannelClick={onChannelClick}
                dmParticipants={dmParticipants}
                onCreateChannel={category.id === 'channels' ? onCreateChannel : undefined}
                onOpenDMPicker={category.id === 'dms' ? onOpenDMPicker : undefined}
              />
            );
          })}
        </SortableContext>

        {/* Add category button */}
        <button
          onClick={handleAddCategory}
          className="flex items-center gap-1.5 px-4 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <Plus className="h-3 w-3" />
          Add category
        </button>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-background border rounded-md shadow-lg py-1 text-sm"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {!categories.find((c) => c.id === ctxMenu.categoryId)?.isDefault && (
            <>
              <button
                onClick={() => {
                  const cat = categories.find((c) => c.id === ctxMenu.categoryId);
                  if (cat) handleRenameStart(cat.id, cat.name);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Rename
              </button>
              <button
                onClick={() => handleDeleteCategory(ctxMenu.categoryId)}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-muted transition-colors text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
          {categories.find((c) => c.id === ctxMenu.categoryId)?.isDefault && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground">
              Default category
            </div>
          )}
        </div>
      )}
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// SortableCategory
// ---------------------------------------------------------------------------

interface SortableCategoryProps {
  category: ChannelCategoryData;
  channels: ChannelWithMeta[];
  activeChannelId?: string;
  isCollapsed: boolean;
  isRenaming: boolean;
  renameValue: string;
  onToggleCollapse: () => void;
  onRenameChange: (val: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onContextMenu: (x: number, y: number) => void;
  onChannelClick: (channel: ChannelWithMeta) => void;
  dmParticipants: Record<string, UserSummary[]>;
  onCreateChannel?: () => void;
  onOpenDMPicker?: () => void;
}

function SortableCategory({
  category,
  channels,
  activeChannelId,
  isCollapsed,
  isRenaming,
  renameValue,
  onToggleCollapse,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  onContextMenu,
  onChannelClick,
  dmParticipants,
  onCreateChannel,
  onOpenDMPicker,
}: SortableCategoryProps) {
  const renameInputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (isRenaming) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [isRenaming]);

  const handleHeaderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e.clientX, e.clientY);
  };

  const isStar = category.id === 'starred';

  return (
    <div ref={setNodeRef} style={style} className="group/category">
      {/* Category header */}
      <div
        className="flex items-center justify-between px-4 py-1 group/header"
        onContextMenu={handleHeaderContextMenu}
      >
        {/* Drag handle for category */}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover/header:opacity-100 transition-opacity cursor-grab active:cursor-grabbing mr-1 text-muted-foreground"
        >
          <GripVertical className="h-3 w-3" />
        </div>

        {isRenaming ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameConfirm();
                if (e.key === 'Escape') onRenameCancel();
              }}
              className="flex-1 text-xs bg-background border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={onRenameConfirm} className="text-primary">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={onRenameCancel} className="text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide flex-1 text-left"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {isStar && <Star className="h-3 w-3" />}
            {category.name}
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {onCreateChannel && (
            <button
              className="opacity-0 group-hover/category:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
              title="Create channel"
              onClick={onCreateChannel}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenDMPicker && (
            <button
              className="opacity-0 group-hover/category:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
              title="New DM"
              onClick={onOpenDMPicker}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {!category.isDefault && (
            <button
              className="opacity-0 group-hover/category:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e.clientX, e.clientY);
              }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Channels list */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <SortableContext
              items={category.channelIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-0.5">
                {channels.map((channel) => (
                  <SortableChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={channel.id === activeChannelId}
                    onClick={() => onChannelClick(channel)}
                    dmParticipants={dmParticipants}
                  />
                ))}
                {channels.length === 0 && (
                  <p className="px-6 py-1 text-xs text-muted-foreground/60 italic">
                    No channels
                  </p>
                )}
              </div>
            </SortableContext>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SortableChannelItem
// ---------------------------------------------------------------------------

interface SortableChannelItemProps {
  channel: ChannelWithMeta;
  isActive: boolean;
  onClick: () => void;
  dmParticipants: Record<string, UserSummary[]>;
}

function SortableChannelItem({
  channel,
  isActive,
  onClick,
  dmParticipants,
}: SortableChannelItemProps) {
  const isDM =
    channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM;

  const participants = isDM ? (dmParticipants[channel.id] ?? []) : [];
  const displayName =
    isDM && participants.length > 0
      ? participants.map((p) => p.name).join(', ')
      : channel.name;

  const presenceMap = useAppStore((s) => s.presenceMap);
  const mainParticipant = participants.length === 1 ? participants[0] : null;
  const isOnline = mainParticipant && presenceMap[mainParticipant.id] === 'online';

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: channel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasUnread = channel.unreadCount > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/channel flex items-center gap-0.5 px-2"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="opacity-0 group-hover/channel:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground p-0.5"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      <button
        onClick={onClick}
        className={cn(
          'flex items-center gap-2 flex-1 rounded-md px-2 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-semibold'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          hasUnread && !isActive && 'text-foreground font-semibold'
        )}
      >
        {isDM ? (
          <div className="relative shrink-0">
            <div className="h-5 w-5 rounded-md bg-muted flex items-center justify-center text-[9px] font-medium">
              {mainParticipant?.image ? (
                <img
                  src={mainParticipant.image}
                  alt={displayName}
                  className="h-5 w-5 rounded-md object-cover"
                />
              ) : (
                getInitials(displayName)
              )}
            </div>
            {mainParticipant && (
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background',
                  isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'
                )}
              />
            )}
          </div>
        ) : channel.type === ChannelType.PRIVATE ? (
          <Lock className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Hash className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="truncate">{displayName}</span>

        {hasUnread && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary shrink-0">
            {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
