'use client';

/**
 * messages/components/AudioRecorder.tsx
 *
 * Microphone button that starts/stops MediaRecorder audio recording.
 * While recording: red pulsing button + live waveform via Web Audio API AnalyserNode.
 * After recording: shows playback preview (waveform + play/pause + duration).
 * On send: uploads audio as file attachment via existing file upload API.
 */

import {
  useRef,
  useState,
  useCallback,
  useEffect,
} from 'react';
import { Mic, MicOff, Play, Pause, Send, Trash2, Square } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

// 5 minutes max recording
const MAX_RECORDING_MS = 5 * 60 * 1000;

interface AudioRecorderProps {
  /** Called with the uploaded file ID (from DB) after user clicks send */
  onSend: (fileId: string, fileName: string, mimeType: string, size: number, duration: number) => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Waveform canvas visualiser
// ---------------------------------------------------------------------------

function WaveformCanvas({
  analyser,
  color = '#8b5cf6',
  height = 32,
}: {
  analyser: AnalyserNode | null;
  color?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser!.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, color]);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={height}
      className="rounded"
      style={{ background: 'rgba(139,92,246,0.08)' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Static waveform bars (for playback preview from blob)
// ---------------------------------------------------------------------------

function StaticWaveformBars({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-center gap-px h-8">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-1 rounded-full bg-primary/60"
          style={{ height: `${Math.max(4, h * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type State = 'idle' | 'recording' | 'preview' | 'uploading';

export function AudioRecorder({ onSend }: AudioRecorderProps) {
  const [state, setState] = useState<State>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // Tracks wall-clock recording start so we can seed previewDuration before
  // loadedmetadata fires (avoids sending with duration=0 on fast submissions).
  const recordingStartMsRef = useRef<number>(0);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close().catch(() => {});
  }

  function discardPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    audioElRef.current?.pause();
    audioBlobRef.current = null;
    analyserRef.current = null;
    setState('idle');
    setElapsed(0);
    setIsPlaying(false);
    setWaveformBars([]);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        audioBlobRef.current = blob;
        previewUrlRef.current = URL.createObjectURL(blob);

        // Compute waveform preview bars from blob
        const bars = await computeWaveformBars(blob, 30);
        setWaveformBars(bars);

        // Seed duration from wall-clock elapsed immediately so Send works even if
        // onloadedmetadata hasn't fired yet (avoids duration=0 on fast sends).
        setPreviewDuration(Math.round((Date.now() - recordingStartMsRef.current) / 1000));

        // Get duration
        const audio = new Audio(previewUrlRef.current);
        audioElRef.current = audio;
        audio.onloadedmetadata = () => {
          setPreviewDuration(Math.round(audio.duration));
        };
        audio.onended = () => setIsPlaying(false);
        audio.load();

        setElapsed(0);
        setState('preview');
        stopStream();
      };

      recordingStartMsRef.current = Date.now();
      recorder.start(100); // Collect data every 100ms
      setState('recording');

      // Timer
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      // Auto-stop at max duration
      maxTimerRef.current = setTimeout(() => {
        toast.warning('Maximum recording length reached (5 minutes)');
        stopRecording();
      }, MAX_RECORDING_MS);
    } catch (err) {
      toast.error('Microphone access denied. Please allow microphone access.');
    }
  }

  function stopRecording() {
    clearTimer();
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
  }

  function handleMicClick() {
    if (state === 'idle') {
      startRecording();
    } else if (state === 'recording') {
      stopRecording();
    }
  }

  function togglePlayback() {
    const audio = audioElRef.current;
    if (!audio || !previewUrlRef.current) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (!audio.src) audio.src = previewUrlRef.current;
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  async function handleSend() {
    if (!audioBlobRef.current) return;
    setState('uploading');

    try {
      const fileName = `voice-message-${Date.now()}.webm`;
      const formData = new FormData();
      formData.append('file', audioBlobRef.current, fileName);

      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const { data } = await res.json();

      onSend(data.id, fileName, audioBlobRef.current.type, data.size, previewDuration);
      discardPreview();
    } catch (err) {
      toast.error('Failed to upload audio');
      setState('preview');
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // --- Render ---

  if (state === 'idle') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={handleMicClick}
        title="Record voice message"
        aria-label="Record voice message"
      >
        <Mic className="h-4 w-4" />
      </Button>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20">
        {/* Live waveform */}
        <WaveformCanvas analyser={analyserRef.current} color="#ef4444" height={28} />

        {/* Timer */}
        <span className="text-xs font-mono text-destructive tabular-nums min-w-[36px]">
          {formatDuration(elapsed)}
        </span>

        {/* Stop button */}
        <motion.button
          type="button"
          className="h-7 w-7 rounded-full bg-destructive flex items-center justify-center"
          onClick={stopRecording}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
          aria-label="Stop recording"
        >
          <Square className="h-3 w-3 text-white fill-white" />
        </motion.button>
      </div>
    );
  }

  if (state === 'preview') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-primary/5 border border-primary/20">
        {/* Play/Pause */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={togglePlayback}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
          )}
        </Button>

        {/* Waveform bars */}
        <StaticWaveformBars bars={waveformBars} />

        {/* Duration */}
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {formatDuration(previewDuration)}
        </span>

        {/* Discard */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={discardPreview}
          aria-label="Discard recording"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        {/* Send */}
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 bg-primary hover:bg-primary/90"
          onClick={handleSend}
          aria-label="Send voice message"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (state === 'uploading') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
        <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Sending…
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Waveform computation
// ---------------------------------------------------------------------------

async function computeWaveformBars(blob: Blob, numBars: number): Promise<number[]> {
  try {
    const audioCtx = new AudioContext();
    const buffer = await blob.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(buffer);
    audioCtx.close().catch(() => {});
    const data = decoded.getChannelData(0);
    const step = Math.floor(data.length / numBars);
    const bars: number[] = [];

    for (let i = 0; i < numBars; i++) {
      let max = 0;
      for (let j = i * step; j < (i + 1) * step; j++) {
        const abs = Math.abs(data[j] ?? 0);
        if (abs > max) max = abs;
      }
      bars.push(max);
    }

    // Normalize
    const peak = Math.max(...bars, 0.001);
    return bars.map((b) => b / peak);
  } catch {
    // If decoding fails (e.g., very short recording), return flat bars
    return Array(numBars).fill(0.3);
  }
}
