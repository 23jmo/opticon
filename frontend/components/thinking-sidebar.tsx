"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingEntry } from "@/lib/types";
import { Agent } from "@/lib/types";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingSidebarProps {
  entries: ThinkingEntry[];
  agents: Agent[];
}

function formatToolDetails(
  toolName: string,
  toolArgs: Record<string, unknown>
): string {
  switch (toolName) {
    case "click": {
      const label = toolArgs.element
        ? `on "${toolArgs.element}"`
        : `at (${toolArgs.x}, ${toolArgs.y})`;
      return `click ${label}`;
    }
    case "type_text":
      return `type "${toolArgs.text}"`;
    case "press_key":
      return `press ${toolArgs.key}`;
    case "scroll":
      return `scroll ${toolArgs.direction} ${toolArgs.amount}`;
    case "move_mouse":
      return `move to (${toolArgs.x}, ${toolArgs.y})`;
    default:
      return `${toolName}(${JSON.stringify(toolArgs)})`;
  }
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 1000
  );
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAgentNumber(agentId: string): string {
  const match = agentId.match(/(\d+)$/);
  return match ? String(parseInt(match[1], 10)) : agentId.slice(0, 4);
}

export function ThinkingSidebar({ entries, agents }: ThinkingSidebarProps) {
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

  return (
    <div className="flex h-full flex-col border-l border-border bg-card/30">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Activity
          </h3>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {entries.length}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-[13px] text-muted-foreground">
              Waiting for activity...
            </p>
          </div>
        ) : (
          <div className="py-1">
            {entries.map((entry, index) => {
              const isExpanded = expandedEntries.has(entry.id);
              const isLatest = index === entries.length - 1;
              const hasDetails =
                entry.reasoning || (entry.toolName && entry.toolArgs);

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "px-4 py-2.5 border-b border-border/50 transition-colors",
                    isLatest ? "bg-muted/50" : "hover:bg-muted/30"
                  )}
                >
                  {/* Main row */}
                  <div className="flex items-start gap-2.5">
                    {/* Agent indicator */}
                    <span className="mt-[3px] shrink-0 flex items-center justify-center size-5 rounded bg-muted text-[10px] font-medium text-muted-foreground tabular-nums">
                      {getAgentNumber(entry.agentId)}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={cn(
                            "text-[13px] leading-snug",
                            isLatest
                              ? "text-foreground font-medium"
                              : "text-foreground/80"
                          )}
                        >
                          {entry.action}
                        </p>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground mt-px">
                          {formatRelativeTime(entry.timestamp)}
                        </span>
                      </div>

                      {/* Tool call inline */}
                      {entry.toolName && entry.toolArgs && (
                        <p className="mt-1 text-[11px] font-mono text-muted-foreground truncate">
                          {formatToolDetails(entry.toolName, entry.toolArgs)}
                        </p>
                      )}

                      {/* Expand toggle */}
                      {hasDetails && (
                        <button
                          onClick={() => toggleExpand(entry.id)}
                          className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight
                            className={cn(
                              "size-3 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                          />
                          {entry.reasoning && entry.toolName
                            ? "reasoning & details"
                            : entry.reasoning
                              ? "reasoning"
                              : "details"}
                        </button>
                      )}

                      {/* Expanded content */}
                      {isExpanded && hasDetails && (
                        <div className="mt-2 space-y-2">
                          {/* Tool args */}
                          {entry.toolName && entry.toolArgs && (
                            <div className="rounded border border-border bg-muted/40 px-3 py-2">
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {Object.entries(entry.toolArgs).map(
                                  ([key, value]) => (
                                    <span
                                      key={key}
                                      className="text-[11px] font-mono"
                                    >
                                      <span className="text-muted-foreground">
                                        {key}
                                      </span>
                                      <span className="text-muted-foreground/60">
                                        {" = "}
                                      </span>
                                      <span className="text-foreground/80">
                                        {typeof value === "string"
                                          ? value.length > 40
                                            ? `"${value.slice(0, 40)}..."`
                                            : `"${value}"`
                                          : String(value)}
                                      </span>
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          )}

                          {/* Reasoning */}
                          {entry.reasoning && (
                            <p className="text-[12px] leading-relaxed text-muted-foreground pl-0.5">
                              {entry.reasoning}
                            </p>
                          )}
                        </div>
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
