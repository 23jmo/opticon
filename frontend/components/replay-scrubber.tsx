"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Radio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReplayManifest, ReplayFrame } from "@/lib/types";

const PLAYBACK_FPS = 4;
const PRELOAD_AHEAD = 5;

/**
 * Hook that loads a replay manifest and manages playback state.
 * Shared between the control bar and the frame overlay.
 */
export function useReplayState(manifestUrl: string) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = live (rightmost)
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  // Fetch manifest
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentIndex(-1);

    fetch(manifestUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
        return res.json();
      })
      .then((data: ReplayManifest) => {
        if (cancelled) return;
        setManifest(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [manifestUrl]);

  const totalFrames = manifest?.frames.length ?? 0;
  const isLive = currentIndex === -1 || currentIndex >= totalFrames - 1;
  const displayIndex = currentIndex === -1 ? totalFrames - 1 : currentIndex;
  const currentFrame: ReplayFrame | null = manifest?.frames[displayIndex] ?? null;

  // Preload upcoming frames
  useEffect(() => {
    if (!manifest || isLive) return;
    for (let i = displayIndex; i < Math.min(displayIndex + PRELOAD_AHEAD, totalFrames); i++) {
      const url = manifest.frames[i].url;
      if (!preloadedRef.current.has(url)) {
        const img = new Image();
        img.src = url;
        preloadedRef.current.add(url);
      }
    }
  }, [manifest, displayIndex, totalFrames, isLive]);

  // Playback timer
  useEffect(() => {
    if (isPlaying && manifest) {
      playIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const idx = prev === -1 ? 0 : prev;
          if (idx >= totalFrames - 1) {
            setIsPlaying(false);
            return -1; // snap to live
          }
          return idx + 1;
        });
      }, 1000 / PLAYBACK_FPS);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, manifest, totalFrames]);

  const goToLive = useCallback(() => {
    setCurrentIndex(-1);
    setIsPlaying(false);
  }, []);

  const scrubTo = useCallback((idx: number) => {
    if (idx >= totalFrames - 1) {
      setCurrentIndex(-1);
    } else {
      setCurrentIndex(idx);
    }
  }, [totalFrames]);

  const stepBack = useCallback(() => {
    setCurrentIndex((prev) => {
      const idx = prev === -1 ? totalFrames - 1 : prev;
      return Math.max(0, idx - 1);
    });
  }, [totalFrames]);

  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => {
      const idx = prev === -1 ? totalFrames - 1 : prev;
      if (idx >= totalFrames - 1) return -1;
      return idx + 1;
    });
  }, [totalFrames]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
    // If at live and pressing play, start from the beginning
    if (!isPlaying && currentIndex === -1) {
      setCurrentIndex(0);
    }
  }, [isPlaying, currentIndex]);

  return {
    manifest, loading, error,
    totalFrames, currentIndex: displayIndex, isLive, isPlaying,
    currentFrame,
    scrubTo, goToLive, stepBack, stepForward, togglePlay,
  };
}

// ─── Frame Overlay ───────────────────────────────────────────────────────────
// Shows on top of the live stream when scrubbed to a past frame.

interface ReplayFrameOverlayProps {
  frame: ReplayFrame | null;
  isLive: boolean;
}

export function ReplayFrameOverlay({ frame, isLive }: ReplayFrameOverlayProps) {
  if (isLive || !frame) return null;

  return (
    <div className="absolute inset-0 z-20 bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frame.url}
        alt={`Frame ${frame.index}`}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Action label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <p className="text-xs text-white/80 truncate">
          {frame.action}
        </p>
      </div>

      {/* "Replay" badge */}
      <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500/80 rounded text-[10px] text-black font-medium">
        REPLAY
      </div>
    </div>
  );
}

// ─── Scrubber Control Bar ────────────────────────────────────────────────────
// Replaces the chat input when replay data exists for the active agent.

interface ReplayScrubberBarProps {
  totalFrames: number;
  currentIndex: number;
  isLive: boolean;
  isPlaying: boolean;
  currentFrame: ReplayFrame | null;
  loading: boolean;
  error: string | null;
  scrubTo: (idx: number) => void;
  goToLive: () => void;
  stepBack: () => void;
  stepForward: () => void;
  togglePlay: () => void;
}

export function ReplayScrubberBar({
  totalFrames, currentIndex, isLive, isPlaying, currentFrame,
  loading, error,
  scrubTo, goToLive, stepBack, stepForward, togglePlay,
}: ReplayScrubberBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); stepBack(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepForward(); }
      else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    };

    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [stepBack, stepForward, togglePlay]);

  if (loading) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-3 py-2 flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading replay...</span>
      </div>
    );
  }

  if (error || totalFrames === 0) {
    return (
      <div className="shrink-0 border-t border-border bg-card px-3 py-2">
        <span className="text-xs text-muted-foreground">{error || "No replay frames"}</span>
      </div>
    );
  }

  return (
    <div
      ref={barRef}
      tabIndex={0}
      className="shrink-0 border-t border-border bg-card px-3 py-2 space-y-1 outline-none focus-within:ring-1 focus-within:ring-primary/30 focus-within:ring-inset"
    >
      {/* Slider */}
      <input
        type="range"
        min={0}
        max={totalFrames - 1}
        value={currentIndex}
        onChange={(e) => scrubTo(Number(e.target.value))}
        className="w-full h-1.5 accent-primary cursor-pointer"
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={() => scrubTo(0)}
            title="Go to start"
          >
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={stepForward}
            title="Next frame"
          >
            <SkipForward className="size-3.5" />
          </Button>

          {/* Live button */}
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 ml-1 text-[10px] gap-1"
            onClick={goToLive}
            title="Go to live"
          >
            <Radio className="size-3" />
            LIVE
          </Button>
        </div>

        {/* Frame info */}
        <div className="flex items-center gap-2">
          {currentFrame && !isLive && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {currentFrame.action}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {isLive ? "LIVE" : `${currentIndex + 1}/${totalFrames}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Full ReplayScrubber (for summary page) ──────────────────────────────────
// Self-contained version with frame display + controls for use outside AgentBrowser.

interface ReplayScrubberProps {
  manifestUrl: string;
  agentLabel?: string;
}

export function ReplayScrubber({ manifestUrl, agentLabel }: ReplayScrubberProps) {
  const state = useReplayState(manifestUrl);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <div className="text-center space-y-2">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading replay...</p>
        </div>
      </div>
    );
  }

  if (state.error || state.totalFrames === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          {state.error || "No replay frames available"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black rounded-lg overflow-hidden">
      {/* Frame display */}
      <div className="flex-1 relative min-h-0">
        {state.currentFrame && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.currentFrame.url}
            alt={`Frame ${state.currentFrame.index}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {state.currentFrame && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <p className="text-xs text-white/80 truncate">
              {state.currentFrame.action}
            </p>
          </div>
        )}

        {agentLabel && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/70">
            {agentLabel}
          </div>
        )}

        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/70 tabular-nums">
          {state.currentIndex + 1} / {state.totalFrames}
        </div>
      </div>

      {/* Controls */}
      <ReplayScrubberBar {...state} />
    </div>
  );
}
