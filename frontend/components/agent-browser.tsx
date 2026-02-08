"use client";

import { useState } from "react";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { VMTab } from "./vm-tab";
import {
  useReplayState,
  ReplayFrameOverlay,
  ReplayScrubberBar,
} from "./replay-scrubber";
import { Send, Ellipsis, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AgentBrowserProps {
  agents: Agent[];
  activeAgentId: string;
  onTabChange: (agentId: string) => void;
  agentActivities: Record<string, AgentActivity>;
  sessionId?: string;
  whiteboard?: string;
  onAgentCommand?: (agentId: string, message: string) => void;
  replays?: Record<string, { manifestUrl: string; frameCount: number }>;
}

export function AgentBrowser({
  agents,
  activeAgentId,
  onTabChange,
  agentActivities,
  sessionId,
  whiteboard,
  onAgentCommand,
  replays,
}: AgentBrowserProps) {
  const isMock = sessionId === "demo";
  const isWhiteboardTab = activeAgentId === "__whiteboard__";
  const [chatInput, setChatInput] = useState("");

  const activeReplay = replays?.[activeAgentId];
  const hasReplay = !!activeReplay && !isWhiteboardTab;

  const handleSendCommand = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onAgentCommand?.(activeAgentId, trimmed);
    setChatInput("");
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-muted/30 overflow-hidden shadow-xl shadow-black/20">
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-border">
        {agents.map((agent, i) => {
          const isActive = agent.id === activeAgentId && !isWhiteboardTab;
          const agentHasReplay = !!replays?.[agent.id];

          return (
            <button
              key={agent.id}
              onClick={() => onTabChange(agent.id)}
              className={cn(
                "group flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors min-w-0",
                isActive
                  ? "bg-background text-foreground"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <span className={cn(
                "flex items-center justify-center size-5 rounded-full border text-[11px] tabular-nums shrink-0",
                agentHasReplay ? "border-primary/40 bg-primary/10" : "border-border",
              )}>
                {i + 1}
              </span>
              <span className="truncate font-medium">{agent.name}</span>
              <span
                className={cn(
                  "flex items-center gap-1 shrink-0 ml-1",
                  isActive
                    ? "text-muted-foreground"
                    : "opacity-0 group-hover:opacity-100 text-muted-foreground"
                )}
              >
                <Ellipsis className="size-4" />
                <X className="size-4" />
              </span>
            </button>
          );
        })}

        {whiteboard !== undefined && (
          <button
            onClick={() => onTabChange("__whiteboard__")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors min-w-0",
              isWhiteboardTab
                ? "bg-background text-foreground"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="flex items-center justify-center size-5 rounded-full border border-primary/30 bg-primary/10 text-[11px] text-primary shrink-0">
              W
            </span>
            <span className="truncate">Whiteboard</span>
          </button>
        )}
      </div>

      {/* Screen content + bottom bar — wrapped together when replay is active */}
      {hasReplay ? (
        <ReplayEnabledView
          manifestUrl={activeReplay.manifestUrl}
          agents={agents}
          activeAgentId={activeAgentId}
          agentActivities={agentActivities}
          sessionId={sessionId}
          isMock={isMock}
        />
      ) : (
        <>
          {/* Screen content */}
          <div className="flex-1 overflow-hidden bg-background relative">
            {whiteboard !== undefined && (
              <div className={`absolute inset-0 ${isWhiteboardTab ? "visible z-10" : "invisible z-0"}`}>
                <WhiteboardView content={whiteboard || ""} />
              </div>
            )}

            {agents.map((agent) => {
              const isActive = agent.id === activeAgentId && !isWhiteboardTab;
              const agentActivity = agentActivities[agent.id];

              if (isMock || !agent.streamUrl) {
                return isActive ? (
                  <div key={agent.id} className="absolute inset-0 z-10">
                    <AgentScreen
                      agentId={agent.id}
                      activity={agentActivity}
                      status={agent.status || "booting"}
                    />
                  </div>
                ) : null;
              }

              return (
                <VMTab
                  key={agent.id}
                  agentId={agent.id}
                  sessionId={sessionId || ""}
                  streamUrl={agent.streamUrl}
                  isActive={isActive}
                />
              );
            })}
          </div>

          {/* Chat input removed — follow-up instructions go through the prompt bar */}
        </>
      )}
    </div>
  );
}

/**
 * When replay exists for the active agent, this component manages shared state
 * between the frame overlay (on top of the live screen) and the scrubber bar (bottom).
 */
function ReplayEnabledView({
  manifestUrl,
  agents,
  activeAgentId,
  agentActivities,
  sessionId,
  isMock,
}: {
  manifestUrl: string;
  agents: Agent[];
  activeAgentId: string;
  agentActivities: Record<string, AgentActivity>;
  sessionId?: string;
  isMock: boolean;
}) {
  const replay = useReplayState(manifestUrl);

  return (
    <>
      {/* Screen content with replay overlay */}
      <div className="flex-1 overflow-hidden bg-background relative">
        {agents.map((agent) => {
          const isActive = agent.id === activeAgentId;
          const agentActivity = agentActivities[agent.id];

          if (isMock || !agent.streamUrl) {
            return isActive ? (
              <div key={agent.id} className="absolute inset-0 z-10">
                <AgentScreen
                  agentId={agent.id}
                  activity={agentActivity}
                  status={agent.status || "booting"}
                />
              </div>
            ) : null;
          }

          return (
            <VMTab
              key={agent.id}
              agentId={agent.id}
              sessionId={sessionId || ""}
              streamUrl={agent.streamUrl}
              isActive={isActive}
            />
          );
        })}

        {/* Replay frame overlay — covers the live screen when scrubbed to a past frame */}
        <ReplayFrameOverlay frame={replay.currentFrame} isLive={replay.isLive} />
      </div>

      {/* Scrubber bar replaces chat input */}
      <ReplayScrubberBar {...replay} />
    </>
  );
}

function WhiteboardView({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground/50">
          Whiteboard is empty. Agents will write here as they work.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="prose prose-invert prose-sm max-w-none">
        <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed font-mono">
          {content}
        </pre>
      </div>
    </div>
  );
}
