"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ThinkingEntry, Agent } from "@/lib/types";
import { cn } from "@/lib/utils";

const SNAP_POINTS = {
  collapsed: 80,
  half: 0.5, // fraction of viewport height
  full: 0.9,
};

interface ThinkingBottomSheetProps {
  entries: ThinkingEntry[];
  agents: Agent[];
  activeAgentId?: string;
}

function getAgentNumber(agentId: string): string {
  const match = agentId.match(/(\d+)$/);
  return match ? String(parseInt(match[1], 10)) : agentId.slice(0, 4);
}

function getAgentIndex(agentId: string, agents: Agent[]): number {
  const idx = agents.findIndex((a) => a.id === agentId);
  return idx >= 0 ? idx : 0;
}

function getAgentColor(index: number) {
  const hue = (index * 90) % 360;
  return {
    bg: `hsl(${hue} 70% 60% / 0.15)`,
    text: `hsl(${hue} 70% 60%)`,
  };
}

export function ThinkingBottomSheet({
  entries,
  agents,
}: ThinkingBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(SNAP_POINTS.collapsed);
  const [isDragging, setIsDragging] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const dragStartRef = useRef({ y: 0, height: 0 });

  const displayEntries = useMemo(() => {
    const filtered = filterAgent
      ? entries.filter((e) => e.agentId === filterAgent)
      : entries;
    return filtered.slice(-100);
  }, [entries, filterAgent]);

  const latestEntry = entries[entries.length - 1];

  const snapToNearest = useCallback((currentHeight: number) => {
    const vh = window.innerHeight;
    const halfPx = vh * SNAP_POINTS.half;
    const fullPx = vh * SNAP_POINTS.full;

    const distances = [
      { h: SNAP_POINTS.collapsed, d: Math.abs(currentHeight - SNAP_POINTS.collapsed) },
      { h: halfPx, d: Math.abs(currentHeight - halfPx) },
      { h: fullPx, d: Math.abs(currentHeight - fullPx) },
    ];

    distances.sort((a, b) => a.d - b.d);
    setHeight(distances[0].h);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      dragStartRef.current = {
        y: e.touches[0].clientY,
        height,
      };
    },
    [height]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaY = dragStartRef.current.y - e.touches[0].clientY;
    const newHeight = Math.max(
      SNAP_POINTS.collapsed,
      Math.min(
        window.innerHeight * SNAP_POINTS.full,
        dragStartRef.current.height + deltaY
      )
    );
    setHeight(newHeight);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    snapToNearest(height);
  }, [height, snapToNearest]);

  const isExpanded = height > SNAP_POINTS.collapsed + 20;

  // Auto-scroll to bottom
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayEntries.length, isExpanded]);

  return (
    <div
      ref={sheetRef}
      className={cn(
        "fixed inset-x-0 bottom-16 z-40 bg-card border-t border-border rounded-t-2xl shadow-2xl shadow-black/40 lg:hidden",
        !isDragging && "transition-[height] duration-300 ease-out"
      )}
      style={{ height: `${height}px` }}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="h-1 w-8 rounded-full bg-zinc-600" />
      </div>

      {/* Collapsed preview */}
      {!isExpanded && latestEntry && (
        <div className="px-4 py-1.5">
          <div className="flex items-center gap-2">
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
              style={{
                backgroundColor: getAgentColor(
                  getAgentIndex(latestEntry.agentId, agents)
                ).bg,
                color: getAgentColor(
                  getAgentIndex(latestEntry.agentId, agents)
                ).text,
              }}
            >
              {getAgentNumber(latestEntry.agentId)}
            </span>
            <p className="text-xs text-zinc-400 line-clamp-1 flex-1">
              {latestEntry.reasoning || latestEntry.action}
            </p>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="flex h-[calc(100%-28px)] flex-col">
          {/* Header + filters */}
          <div className="shrink-0 px-4 py-2 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Thinking
              </h3>
              <span className="text-[10px] text-zinc-600">
                {displayEntries.length} entries
              </span>
            </div>
            {agents.length > 1 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button
                  onClick={() => setFilterAgent(null)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                    filterAgent === null
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  All
                </button>
                {agents.map((agent, idx) => {
                  const isActive = filterAgent === agent.id;
                  const color = getAgentColor(idx);
                  return (
                    <button
                      key={agent.id}
                      onClick={() =>
                        setFilterAgent(
                          filterAgent === agent.id ? null : agent.id
                        )
                      }
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                        !isActive && "text-muted-foreground"
                      )}
                      style={
                        isActive
                          ? {
                              backgroundColor: color.bg,
                              color: color.text,
                            }
                          : undefined
                      }
                    >
                      {getAgentNumber(agent.id)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Feed */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
            {displayEntries.length === 0 ? (
              <div className="flex h-20 items-center justify-center">
                <p className="text-[13px] text-muted-foreground">
                  Waiting for agent thoughts...
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {displayEntries.map((entry) => {
                  const agentIdx = getAgentIndex(entry.agentId, agents);
                  const agentColor = getAgentColor(agentIdx);
                  const bodyText = entry.reasoning || entry.action;

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex gap-2 py-1",
                        entry.isError && "bg-destructive/10 rounded px-2"
                      )}
                    >
                      <span
                        className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold mt-0.5"
                        style={{
                          backgroundColor: agentColor.bg,
                          color: agentColor.text,
                        }}
                      >
                        {getAgentNumber(entry.agentId)}
                      </span>
                      <p
                        className={cn(
                          "text-xs leading-relaxed flex-1",
                          entry.isError
                            ? "text-destructive font-medium"
                            : "text-foreground/80"
                        )}
                      >
                        {bodyText}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
