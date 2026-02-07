"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingEntry } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingPanelProps {
  agentId: string;
  sessionId: string;
  entries: ThinkingEntry[];
}

export function ThinkingPanel({
  agentId,
  sessionId,
  entries,
}: ThinkingPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
    new Set()
  );

  // Auto-scroll to bottom when new entries arrive
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

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col border-l bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b bg-white px-4 py-3 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Agent Thinking
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {entries.length} action{entries.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-4 space-y-3">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500 dark:text-zinc-400">
              Waiting for agent actions...
            </div>
          ) : (
            entries.map((entry, index) => {
              const isExpanded = expandedEntries.has(entry.id);
              const hasReasoning = !!entry.reasoning;

              return (
                <div key={entry.id}>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {entry.action}
                          </p>
                          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>

                        {hasReasoning && (
                          <button
                            onClick={() => toggleExpand(entry.id)}
                            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="size-3" />
                                Hide reasoning
                              </>
                            ) : (
                              <>
                                <ChevronDown className="size-3" />
                                Show reasoning
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && hasReasoning && (
                      <div className="ml-9 rounded-md bg-zinc-100 dark:bg-zinc-800 p-3">
                        <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                          {entry.reasoning}
                        </p>
                      </div>
                    )}
                  </div>
                  {index < entries.length - 1 && (
                    <Separator className="my-3" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
