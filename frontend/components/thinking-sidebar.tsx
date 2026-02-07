"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingEntry } from "@/lib/types";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingSidebarProps {
  entries: ThinkingEntry[];
  agents: Agent[];
  agentActivities: Record<string, AgentActivity>;
}

export function ThinkingSidebar({
  entries,
  agents,
  agentActivities,
}: ThinkingSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const toggleExpand = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-card/20">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Live Activity
            </h3>
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {entries.length} event{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Activity feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground/50">
              Waiting for agent activity...
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {entries.map((entry, index) => {
              const isExpanded = expandedEntries.has(entry.id);
              const isLast = index === entries.length - 1;
              const activity = agentActivities[entry.agentId];

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-lg px-3 py-2.5 transition-colors animate-slide-in",
                    isLast ? "bg-primary/[0.06]" : "hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Agent badge */}
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                        activity?.badgeClass ||
                          "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/20"
                      )}
                    >
                      {activity?.label || entry.agentId.slice(0, 6)}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-[12px] leading-snug",
                            isLast
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          )}
                        >
                          {entry.action}
                        </p>
                        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/40 pt-0.5">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>

                      {entry.reasoning && (
                        <>
                          <button
                            onClick={() => toggleExpand(entry.id)}
                            className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          >
                            <ChevronRight
                              className={cn(
                                "size-2.5 transition-transform",
                                isExpanded && "rotate-90"
                              )}
                            />
                            reasoning
                          </button>

                          {isExpanded && (
                            <div className="rounded-md border border-border bg-muted/30 p-2.5 animate-slide-in">
                              <p className="text-[10px] leading-relaxed text-muted-foreground/70 whitespace-pre-wrap">
                                {entry.reasoning}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
