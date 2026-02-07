"use client";

import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { ChevronLeft, ChevronRight, RotateCw, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentBrowserProps {
  agents: Agent[];
  activeAgentId: string;
  onTabChange: (agentId: string) => void;
  agentActivities: Record<string, AgentActivity>;
}

export function AgentBrowser({
  agents,
  activeAgentId,
  onTabChange,
  agentActivities,
}: AgentBrowserProps) {
  const activity = agentActivities[activeAgentId];
  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-muted/30 overflow-hidden shadow-xl shadow-black/20">
      {/* Window chrome: traffic lights + tabs */}
      <div className="flex items-center bg-muted/60 pl-3 pr-2 pt-2.5 pb-0">
        {/* Traffic lights */}
        <div className="flex gap-1.5 mr-3 mb-2 shrink-0">
          <div className="size-[11px] rounded-full bg-[#ff5f57]" />
          <div className="size-[11px] rounded-full bg-[#febc2e]" />
          <div className="size-[11px] rounded-full bg-[#28c840]" />
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 min-w-0">
          {agents.map((agent) => {
            const isActive = agent.id === activeAgentId;
            const agentActivity = agentActivities[agent.id];

            return (
              <button
                key={agent.id}
                onClick={() => onTabChange(agent.id)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-4 py-2 text-[11px] font-medium transition-all min-w-0",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    agent.status === "active"
                      ? "bg-emerald-400"
                      : agent.status === "terminated"
                        ? "bg-zinc-600"
                        : "bg-amber-400 animate-pulse"
                  )}
                />
                <span className="truncate">
                  {agentActivity?.label || `Agent ${agent.id.slice(0, 6)}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
        <div className="flex items-center gap-0.5 text-muted-foreground/40 shrink-0">
          <ChevronLeft className="size-4" />
          <ChevronRight className="size-4" />
          <RotateCw className="size-3 ml-1" />
        </div>

        <div className="flex-1 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 min-w-0">
          {activity?.url && (
            <>
              <Lock className="size-3 text-muted-foreground/40 shrink-0" />
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                {activity.url}
              </span>
            </>
          )}
          {!activity?.url && (
            <span className="text-[11px] text-muted-foreground/40">
              Waiting for connection...
            </span>
          )}
        </div>
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-hidden bg-background">
        <AgentScreen
          agentId={activeAgentId}
          activity={activity}
          status={activeAgent?.status || "initializing"}
        />
      </div>
    </div>
  );
}
