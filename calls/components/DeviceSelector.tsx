/**
 * calls/components/DeviceSelector.tsx
 *
 * Dropdown for selecting cameras, microphones, and speakers.
 * Uses shadcn Select component. Reads from useMediaDevices hook.
 *
 * Usage:
 *   <DeviceSelector />
 */

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Camera, Mic, Volume2 } from 'lucide-react';
import { useMediaDevices } from '@/calls/hooks/useMediaDevices';
import { cn } from '@/shared/lib/utils';

interface DeviceSelectorProps {
  /** Which device types to show */
  show?: ('camera' | 'microphone' | 'speaker')[];
  className?: string;
}

interface DeviceRowProps {
  icon: React.ReactNode;
  label: string;
  devices: MediaDeviceInfo[];
  selected: string | null;
  onSelect: (deviceId: string) => void;
}

function DeviceRow({ icon, label, devices, selected, onSelect }: DeviceRowProps) {
  if (devices.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
        {icon}
        {label}
      </div>
      <Select value={selected ?? ''} onValueChange={onSelect}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
              {device.label || `${label} ${device.deviceId.slice(0, 8)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DeviceSelector({ show = ['camera', 'microphone', 'speaker'], className }: DeviceSelectorProps) {
  const {
    cameras,
    microphones,
    speakers,
    selectedCamera,
    selectedMicrophone,
    selectedSpeaker,
    selectDevice,
  } = useMediaDevices();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {show.includes('camera') && (
        <DeviceRow
          icon={<Camera className="h-3.5 w-3.5" />}
          label="Camera"
          devices={cameras}
          selected={selectedCamera}
          onSelect={(id) => selectDevice('camera', id)}
        />
      )}

      {show.includes('microphone') && (
        <DeviceRow
          icon={<Mic className="h-3.5 w-3.5" />}
          label="Microphone"
          devices={microphones}
          selected={selectedMicrophone}
          onSelect={(id) => selectDevice('microphone', id)}
        />
      )}

      {show.includes('speaker') && (
        <DeviceRow
          icon={<Volume2 className="h-3.5 w-3.5" />}
          label="Speaker"
          devices={speakers}
          selected={selectedSpeaker}
          onSelect={(id) => selectDevice('speaker', id)}
        />
      )}
    </div>
  );
}
