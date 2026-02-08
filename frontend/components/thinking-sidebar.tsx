"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import { ThinkingEntry, Agent } from "@/lib/types";
import { ChevronRight, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_ENTRIES = 200;
const TYPEWRITER_SPEED = 60;
const SCROLL_THRESHOLD = 100;

interface ThinkingSidebarProps {
  entries: ThinkingEntry[];
  agents: Agent[];
  activeAgentId?: string;
}

// --- Helpers ---

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

function smartTruncate(text: string, startLen = 20, endLen = 10): string {
  if (text.length <= startLen + endLen + 3) return text;
  return text.slice(0, startLen) + "\u2026" + text.slice(-endLen);
}

function formatToolChip(
  toolName: string,
  toolArgs: Record<string, unknown>
): string {
  switch (toolName) {
    case "click": {
      if (toolArgs.element)
        return `click("${smartTruncate(String(toolArgs.element))}")`;
      return `click(${toolArgs.x}, ${toolArgs.y})`;
    }
    case "type_text":
      return `type_text("${smartTruncate(String(toolArgs.text))}")`;
    case "press_key":
      return `press_key(${toolArgs.key})`;
    case "scroll":
      return `scroll(${toolArgs.direction}, ${toolArgs.amount})`;
    case "move_mouse":
      return `move_mouse(${toolArgs.x}, ${toolArgs.y})`;
    default:
      return `${toolName}({…})`;
  }
}

// --- TypewriterText ---

function TypewriterText({
  text,
  animate,
  speed = TYPEWRITER_SPEED,
  onComplete,
}: {
  text: string;
  animate: boolean;
  speed?: number;
  onComplete?: () => void;
}) {
  const [wordCount, setWordCount] = useState(0);
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!animate || hasAnimated.current) {
      setWordCount(words.length);
      return;
    }

    setWordCount(0);
    let current = 0;
    const interval = setInterval(() => {
      current++;
      setWordCount(current);
      if (current >= words.length) {
        clearInterval(interval);
        hasAnimated.current = true;
        onCompleteRef.current?.();
      }
    }, speed);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, text, words.length, speed]);

  if (!animate || hasAnimated.current || wordCount >= words.length)
    return <>{text}</>;

  return (
    <>
      {words.slice(0, wordCount).join(" ")}
      <span className="inline-block w-[2px] h-[0.85em] bg-foreground/40 ml-0.5 animate-pulse align-text-bottom" />
    </>
  );
}

// --- ToolChip ---

const ToolChip = memo(function ToolChip({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: ThinkingEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!entry.toolName || !entry.toolArgs) return null;

  const chipText = formatToolChip(entry.toolName, entry.toolArgs);

  return (
    <div className="mt-1.5" style={{ animation: "chipEnter 0.3s ease-out" }}>
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1 max-w-full rounded px-2 py-1 text-[11px] font-mono transition-colors",
          "text-muted-foreground/70 bg-muted/40 hover:bg-muted/60 hover:text-muted-foreground"
        )}
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            isExpanded && "rotate-90"
          )}
        />
        <span className="truncate">{chipText}</span>
      </button>

      {isExpanded && (
        <div className="mt-1 ml-1 rounded border border-border bg-muted/40 px-3 py-2">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(entry.toolArgs).map(([key, value]) => (
              <span key={key} className="text-[11px] font-mono">
                <span className="text-muted-foreground">{key}</span>
                <span className="text-muted-foreground/60">{" = "}</span>
                <span className="text-foreground/80">
                  {typeof value === "string"
                    ? value.length > 40
                      ? `"${value.slice(0, 40)}…"`
                      : `"${value}"`
                    : String(value)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// --- Main Component ---

export function ThinkingSidebar({
  entries,
  agents,
  activeAgentId,
}: ThinkingSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(
    new Set()
  );
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const animatedEntries = useRef(new Set<string>());
  const lastSeenCount = useRef(0);
  const prevEntryCount = useRef(0);

  // Rolling window + filtering
  const { displayEntries, trimmed } = useMemo(() => {
    const filtered = filterAgent
      ? entries.filter((e) => e.agentId === filterAgent)
      : entries;
    if (filtered.length <= MAX_ENTRIES)
      return { displayEntries: filtered, trimmed: false };
    return {
      displayEntries: filtered.slice(-MAX_ENTRIES),
      trimmed: true,
    };
  }, [entries, filterAgent]);

  // Compute thread map: entry.id -> threadId (first entry's id in the consecutive run)
  const threadMap = useMemo(() => {
    const map = new Map<string, string>();
    let currentThreadId = "";
    let currentAgentId = "";
    for (const entry of displayEntries) {
      if (entry.agentId !== currentAgentId) {
        currentAgentId = entry.agentId;
        currentThreadId = entry.id;
      }
      map.set(entry.id, currentThreadId);
    }
    return map;
  }, [displayEntries]);

  // Scroll tracking
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const nearBottom =
      scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
    setIsNearBottom(nearBottom);
    if (nearBottom) {
      setUnseenCount(0);
      lastSeenCount.current = displayEntries.length;
    }
  }, [displayEntries.length]);

  // Auto-scroll + unseen count tracking
  useEffect(() => {
    if (isNearBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      lastSeenCount.current = displayEntries.length;
      setUnseenCount(0);
    } else if (displayEntries.length > prevEntryCount.current) {
      const newUnseen = displayEntries.length - lastSeenCount.current;
      if (newUnseen > 0) setUnseenCount(newUnseen);
    }
    prevEntryCount.current = displayEntries.length;
  }, [displayEntries.length, isNearBottom]);

  const jumpToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setIsNearBottom(true);
    setUnseenCount(0);
    lastSeenCount.current = displayEntries.length;
  }, [displayEntries.length]);

  const toggleThread = useCallback((threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }, []);

  const markAnimated = useCallback((entryId: string) => {
    animatedEntries.current.add(entryId);
  }, []);

  const isFiltered = filterAgent !== null;

  return (
    <div className="relative flex h-full flex-col border-l border-border bg-card/30">
      {/* Inline keyframes for chip enter animation */}
      <style>{`
        @keyframes chipEnter {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Thinking
        </h3>

        {/* Agent filter */}
        {agents.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setFilterAgent(null)}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                filterAgent === null
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
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
                    setFilterAgent(filterAgent === agent.id ? null : agent.id)
                  }
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors",
                    !isActive && "text-muted-foreground hover:text-foreground"
                  )}
                  style={
                    isActive
                      ? { backgroundColor: color.bg, color: color.text }
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
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* Trimmed indicator */}
        {trimmed && (
          <div className="px-4 py-2 text-center">
            <span className="text-[10px] text-muted-foreground/60">
              Showing last {MAX_ENTRIES} entries
            </span>
          </div>
        )}

        {displayEntries.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-[13px] text-muted-foreground">
              Waiting for agent thoughts…
            </p>
          </div>
        ) : (
          <div className="py-1">
            {displayEntries.map((entry, index) => {
              const prevEntry =
                index > 0 ? displayEntries[index - 1] : null;
              const isSameAgent = prevEntry?.agentId === entry.agentId;
              const showHeader = !isSameAgent;
              const threadId = threadMap.get(entry.id) || entry.id;
              const isThreadExpanded = expandedThreads.has(threadId);
              const shouldAnimate =
                !!entry.reasoning &&
                !animatedEntries.current.has(entry.id);
              const bodyText = entry.reasoning || entry.action;
              const agentIdx = getAgentIndex(entry.agentId, agents);
              const agentColor = getAgentColor(agentIdx);

              // --- Filtered mode: minimal headers, hover timestamps ---
              if (isFiltered) {
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "group px-4 py-1.5",
                      entry.isError && "bg-destructive/10"
                    )}
                  >
                    {/* Hover timestamp */}
                    <div className="relative">
                      <span className="absolute right-0 top-0 text-[10px] tabular-nums text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {formatRelativeTime(entry.timestamp)}
                      </span>

                      <p
                        className={cn(
                          "pr-14 text-sm leading-relaxed",
                          entry.isError
                            ? "font-medium text-destructive"
                            : "text-foreground/90"
                        )}
                      >
                        <TypewriterText
                          text={bodyText}
                          animate={shouldAnimate}
                          onComplete={() => markAnimated(entry.id)}
                        />
                      </p>

                      {entry.toolName && entry.toolArgs && (
                        <ToolChip
                          entry={entry}
                          isExpanded={isThreadExpanded}
                          onToggle={() => toggleThread(threadId)}
                        />
                      )}
                    </div>
                  </div>
                );
              }

              // --- Unfiltered mode: full threading ---
              return (
                <div
                  key={entry.id}
                  className={cn(showHeader && index > 0 && "pt-3")}
                >
                  {/* Agent header (only on thread start) */}
                  {showHeader && (
                    <div className="mb-0.5 flex items-center gap-2 px-4 pt-1">
                      <span
                        className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums"
                        style={{
                          backgroundColor: agentColor.bg,
                          color: agentColor.text,
                        }}
                      >
                        {getAgentNumber(entry.agentId)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        Agent {getAgentNumber(entry.agentId)}
                      </span>
                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    </div>
                  )}

                  {/* Entry content */}
                  <div
                    className={cn(
                      "px-4 py-1",
                      isSameAgent && "ml-3 border-l-2 pl-3",
                      isSameAgent &&
                        (entry.isError
                          ? "border-destructive"
                          : "border-muted"),
                      !isSameAgent && entry.isError && "bg-destructive/10"
                    )}
                  >
                    {/* Inline timestamp for continuation entries */}
                    {isSameAgent && (
                      <span className="float-right ml-2 text-[10px] tabular-nums text-muted-foreground/50">
                        {formatRelativeTime(entry.timestamp)}
                      </span>
                    )}

                    {/* Body text */}
                    <p
                      className={cn(
                        "text-sm leading-relaxed",
                        entry.isError
                          ? "font-medium text-destructive"
                          : "text-foreground/90"
                      )}
                    >
                      <TypewriterText
                        text={bodyText}
                        animate={shouldAnimate}
                        onComplete={() => markAnimated(entry.id)}
                      />
                    </p>

                    {/* Tool chip */}
                    {entry.toolName && entry.toolArgs && (
                      <ToolChip
                        entry={entry}
                        isExpanded={isThreadExpanded}
                        onToggle={() => toggleThread(threadId)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Jump to bottom button */}
      {!isNearBottom && unseenCount > 0 && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90"
        >
          <ArrowDown className="size-3" />
          {unseenCount} new
        </button>
      )}
    </div>
  );
}
