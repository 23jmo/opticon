"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Task, Agent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, ArrowLeft, ChevronLeft, ChevronRight, MonitorPlay } from "lucide-react";
import { ReplayScrubber } from "./replay-scrubber";

interface SessionSummaryProps {
  sessionId: string;
  prompt?: string;
  tasks: Task[];
  agents: Agent[];
  whiteboard?: string;
}

export function SessionSummary({
  sessionId,
  prompt,
  tasks,
  agents,
  whiteboard,
}: SessionSummaryProps) {
  const router = useRouter();
  const [replays, setReplays] = useState<Record<string, { manifestUrl: string; frameCount: number }>>({});

  // Fetch replays on mount
  useEffect(() => {
    fetch(`/api/replay/${sessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.replays) return;
        const map: Record<string, { manifestUrl: string; frameCount: number }> = {};
        for (const r of data.replays) {
          map[r.agentId] = { manifestUrl: r.manifestUrl, frameCount: r.frameCount };
        }
        setReplays(map);
      })
      .catch(() => {});
  }, [sessionId]);

  const completedTasks = tasks.filter((t) => t.status === "completed");
  const tasksByAgent = agents.reduce(
    (acc, agent) => {
      acc[agent.id] = tasks.filter(
        (t) => t.assignedTo === agent.id && t.status === "completed"
      );
      return acc;
    },
    {} as Record<string, Task[]>
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="size-8 text-emerald-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Session Complete</h1>
            {prompt ? (
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                {prompt}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                All agents have finished their work
              </p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">
              {completedTasks.length}
              <span className="text-muted-foreground">/{tasks.length}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Tasks Done</p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{agents.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agents Used</p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="text-center">
            <p className="font-mono text-sm text-muted-foreground pt-1.5">
              {sessionId.slice(0, 8)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Session ID</p>
          </div>
        </div>

        {/* Agent cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => {
            const agentTasks = tasksByAgent[agent.id] || [];
            return (
              <Card key={agent.id} className="bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Agent {agent.id.slice(0, 6)}
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px]">
                      {agentTasks.length} task
                      {agentTasks.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {agentTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {agentTasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex items-start gap-2"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                          <span className="text-sm text-muted-foreground leading-snug">
                            {typeof task.description === "string"
                              ? task.description
                              : JSON.stringify(task.description)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">
                      No tasks completed
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Agent Replays */}
        {Object.keys(replays).length > 0 && (
          <ReplayCarousel replays={replays} agents={agents} />
        )}

        {/* Whiteboard */}
        {whiteboard && typeof whiteboard === "string" && (
          <Card className="bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Whiteboard</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed font-mono">
                {whiteboard}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Return button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="gap-2"
          >
            <ArrowLeft className="size-3.5" />
            New Session
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Replay Carousel ──────────────────────────────────────────────────────────

interface ReplayCarouselProps {
  replays: Record<string, { manifestUrl: string; frameCount: number }>;
  agents: Agent[];
}

function ReplayCarousel({ replays, agents }: ReplayCarouselProps) {
  const agentIds = agents
    .map((a) => a.id)
    .filter((id) => replays[id] && replays[id].frameCount > 0);

  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const SWIPE_THRESHOLD = 50;

  const goNext = useCallback(() => {
    setActiveIdx((prev) => Math.min(prev + 1, agentIds.length - 1));
  }, [agentIds.length]);

  const goPrev = useCallback(() => {
    setActiveIdx((prev) => Math.max(prev - 1, 0));
  }, []);

  // Keyboard left/right to switch agents
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && e.shiftKey) { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight" && e.shiftKey) { e.preventDefault(); goNext(); }
    };
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  if (agentIds.length === 0) return null;

  const currentAgentId = agentIds[activeIdx];
  const currentReplay = replays[currentAgentId];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > SWIPE_THRESHOLD) goPrev();
    else if (diff < -SWIPE_THRESHOLD) goNext();
    touchStartX.current = null;
  };

  return (
    <div ref={containerRef} tabIndex={0} className="space-y-3 outline-none">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorPlay className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Agent Replays</h2>
        </div>
        {agentIds.length > 1 && (
          <span className="text-xs text-muted-foreground">
            Shift + Arrow keys to switch agents
          </span>
        )}
      </div>

      {/* Agent tabs */}
      {agentIds.length > 1 && (
        <div className="flex items-center gap-1.5">
          {agentIds.map((id, idx) => (
            <button
              key={id}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                idx === activeIdx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              Agent {id.slice(0, 6)}
              <span className="ml-1.5 opacity-60">{replays[id].frameCount}f</span>
            </button>
          ))}
        </div>
      )}

      {/* Replay viewer */}
      <Card className="bg-card/50 overflow-hidden">
        <div
          className="h-[420px]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <ReplayScrubber
            key={currentAgentId}
            manifestUrl={currentReplay.manifestUrl}
            agentLabel={`Agent ${currentAgentId.slice(0, 6)}`}
          />
        </div>
      </Card>

      {/* Prev/Next arrows for multi-agent */}
      {agentIds.length > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={goPrev}
            disabled={activeIdx === 0}
          >
            <ChevronLeft className="size-3.5" />
            Previous Agent
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {activeIdx + 1} / {agentIds.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={goNext}
            disabled={activeIdx === agentIds.length - 1}
          >
            Next Agent
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
