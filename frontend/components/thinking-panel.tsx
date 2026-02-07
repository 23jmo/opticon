"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingEntry } from "@/lib/types";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingPanelProps {
  agentId: string;
  sessionId: string;
  entries: ThinkingEntry[];
}

export function ThinkingPanel({ entries }: ThinkingPanelProps) {
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
    <div className="flex h-full flex-col border-l border-border bg-card/30">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Thinking
          </h3>
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {entries.length} step{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground/60">
              Waiting for actions...
            </p>
          </div>
        ) : (
          <div className="p-4">
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-4">
                {entries.map((entry, index) => {
                  const isExpanded = expandedEntries.has(entry.id);
                  const isLast = index === entries.length - 1;

                  return (
                    <div
                      key={entry.id}
                      className="relative pl-6 animate-slide-in"
                    >
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          "absolute left-0 top-1 size-[15px] rounded-full border-2 border-background",
                          isLast
                            ? "bg-primary shadow-[0_0_8px_oklch(0.715_0.143_211_/_0.4)]"
                            : "bg-muted-foreground/40"
                        )}
                      />

                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-medium text-foreground leading-snug">
                            {entry.action}
                          </p>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60 pt-0.5">
                            {formatTime(entry.timestamp)}
                          </span>
                        </div>

                        {entry.reasoning && (
                          <>
                            <button
                              onClick={() => toggleExpand(entry.id)}
                              className="group flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3 transition-transform",
                                  isExpanded && "rotate-90"
                                )}
                              />
                              reasoning
                            </button>

                            {isExpanded && (
                              <div className="rounded-md border border-border bg-muted p-3 animate-slide-in">
                                <p className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono">
                                  {entry.reasoning}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
