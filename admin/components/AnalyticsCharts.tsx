'use client';

/**
 * admin/components/AnalyticsCharts.tsx
 *
 * Recharts visualizations for workspace analytics.
 * - LineChart: messages per day (30 days)
 * - AreaChart: active users per day
 * - BarChart: top 10 channels
 * - Horizontal BarChart: top 10 users leaderboard
 * - Stats cards with Framer Motion counter animation
 */

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell,
} from 'recharts';
import { MessageSquare, Users, Hash, Paperclip } from 'lucide-react';
import type { AnalyticsData } from '../types';
import { cn } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Animated counter
// ---------------------------------------------------------------------------

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v).toLocaleString());
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: 'easeOut',
    });
    const unsub = rounded.on('change', (v) => setDisplayValue(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, motionValue, rounded]);

  return <span className={className}>{displayValue}</span>;
}

// ---------------------------------------------------------------------------
// Stats cards
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border rounded-xl p-5 bg-card"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <AnimatedCounter
            value={value}
            className="text-3xl font-bold mt-1"
          />
        </div>
        <div
          className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Chart theme
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  primary: '#8b5cf6',
  secondary: '#6366f1',
  blue: '#3b82f6',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
};

const BAR_COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AnalyticsChartsProps {
  data: AnalyticsData & {
    topUsers?: Array<{ userId: string; name: string; messageCount: number }>;
    totalFiles?: number;
  };
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const topUsers = data.topUsers ?? [];

  return (
    <div className="space-y-8">
      {/* Stats cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Messages"
          value={data.totalMessages}
          icon={<MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
          color="bg-purple-100 dark:bg-purple-900/30"
        />
        <StatCard
          label="Total Members"
          value={data.totalMembers}
          icon={<Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          color="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          label="Total Channels"
          value={data.totalChannels}
          icon={<Hash className="w-5 h-5 text-green-600 dark:text-green-400" />}
          color="bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          label="Files Shared"
          value={data.totalFiles ?? 0}
          icon={<Paperclip className="w-5 h-5 text-orange-600 dark:text-orange-400" />}
          color="bg-orange-100 dark:bg-orange-900/30"
        />
      </div>

      {/* Messages per day - Line Chart */}
      <div className="border rounded-xl p-5 bg-card">
        <h3 className="text-sm font-semibold mb-4">Messages per Day (Last 30 Days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.messagesPerDay}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(5)} // MM-DD
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(v: string) => `Date: ${v}`}
              formatter={(v: number) => [v, 'Messages']}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke={CHART_COLORS.primary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Active users per day - Area Chart */}
      <div className="border rounded-xl p-5 bg-card">
        <h3 className="text-sm font-semibold mb-4">Active Users per Day (Last 30 Days)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.activeUsersPerDay}>
            <defs>
              <linearGradient id="activeUsersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(5)}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(v: string) => `Date: ${v}`}
              formatter={(v: number) => [v, 'Active Users']}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={CHART_COLORS.blue}
              strokeWidth={2}
              fill="url(#activeUsersGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column layout for channel + user charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top channels - Vertical BarChart */}
        <div className="border rounded-xl p-5 bg-card">
          <h3 className="text-sm font-semibold mb-4">Top 10 Channels by Messages</h3>
          {data.topChannels.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
              No channel data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.topChannels} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={90}
                  tickFormatter={(v: string) => `#${v.slice(0, 10)}${v.length > 10 ? '…' : ''}`}
                />
                <Tooltip formatter={(v: number) => [v, 'Messages']} />
                <Bar dataKey="messageCount" radius={[0, 3, 3, 0]}>
                  {data.topChannels.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top users - Horizontal BarChart leaderboard */}
        <div className="border rounded-xl p-5 bg-card">
          <h3 className="text-sm font-semibold mb-4">Top 10 Most Active Members</h3>
          {topUsers.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
              No user data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topUsers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={90}
                  tickFormatter={(v: string) => v.slice(0, 12) + (v.length > 12 ? '…' : '')}
                />
                <Tooltip formatter={(v: number) => [v, 'Messages']} />
                <Bar dataKey="messageCount" radius={[0, 3, 3, 0]}>
                  {topUsers.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
