"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReplayManifest, ReplayFrame } from "@/lib/types";

interface ReplayScrubberProps {
  manifestUrl: string;
  agentLabel?: string;
}

const PLAYBACK_FPS = 4;
const PRELOAD_AHEAD = 5;

export function ReplayScrubber({ manifestUrl, agentLabel }: ReplayScrubberProps) {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  // Fetch manifest on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

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
  const currentFrame: ReplayFrame | null = manifest?.frames[currentIndex] ?? null;

  // Preload upcoming frames
  useEffect(() => {
    if (!manifest) return;
    for (let i = currentIndex; i < Math.min(currentIndex + PRELOAD_AHEAD, totalFrames); i++) {
      const url = manifest.frames[i].url;
      if (!preloadedRef.current.has(url)) {
        const img = new Image();
        img.src = url;
        preloadedRef.current.add(url);
      }
    }
  }, [manifest, currentIndex, totalFrames]);

  // Playback control
  useEffect(() => {
    if (isPlaying && manifest) {
      playIntervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / PLAYBACK_FPS);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, manifest, totalFrames]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!manifest) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(totalFrames - 1, prev + 1));
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    },
    [manifest, totalFrames]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <div className="text-center space-y-2">
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading replay...</p>
        </div>
      </div>
    );
  }

  if (error || !manifest || totalFrames === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-black/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          {error || "No replay frames available"}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex flex-col h-full bg-black rounded-lg overflow-hidden outline-none focus:ring-1 focus:ring-primary/50"
    >
      {/* Frame display */}
      <div className="flex-1 relative min-h-0">
        {currentFrame && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentFrame.url}
            alt={`Frame ${currentFrame.index}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {/* Action label overlay */}
        {currentFrame && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <p className="text-xs text-white/80 truncate">
              {currentFrame.action}
            </p>
          </div>
        )}

        {/* Agent label */}
        {agentLabel && (
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/70">
            {agentLabel}
          </div>
        )}

        {/* Frame counter */}
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/70 tabular-nums">
          {currentIndex + 1} / {totalFrames}
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 px-3 py-2 bg-card/80 border-t border-border space-y-1.5">
        {/* Scrubber slider */}
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentIndex}
          onChange={(e) => setCurrentIndex(Number(e.target.value))}
          className="w-full h-1.5 accent-primary cursor-pointer"
        />

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => setCurrentIndex(0)}
              title="Go to start"
            >
              <SkipBack className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsPlaying((prev) => !prev)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="size-3.5" />
              ) : (
                <Play className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => setCurrentIndex(totalFrames - 1)}
              title="Go to end"
            >
              <SkipForward className="size-3.5" />
            </Button>
          </div>

          {/* Timestamp */}
          {currentFrame && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(currentFrame.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
