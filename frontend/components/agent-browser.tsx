"use client";

import { useState } from "react";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AgentBrowserProps {
  agents: Agent[];
  activeAgentId: string;
  onTabChange: (agentId: string) => void;
  agentActivities: Record<string, AgentActivity>;
  onAgentCommand?: (agentId: string, message: string) => void;
}

export function AgentBrowser({
  agents,
  activeAgentId,
  onTabChange,
  agentActivities,
  onAgentCommand,
}: AgentBrowserProps) {
  const activity = agentActivities[activeAgentId];
  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const [chatInput, setChatInput] = useState("");

  const handleSendCommand = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onAgentCommand?.(activeAgentId, trimmed);
    setChatInput("");
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-muted/30 overflow-hidden shadow-xl shadow-black/20">
      {/* Tabs */}
      <div className="flex items-center bg-muted/60 px-2 pt-3 pb-0">
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

      {/* Screen content */}
      <div className="flex-1 overflow-hidden bg-background">
        <AgentScreen
          agentId={activeAgentId}
          activity={activity}
          status={activeAgent?.status || "initializing"}
        />
      </div>

      {/* Chat input */}
      <div className="shrink-0 border-t border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendCommand();
              }
            }}
            placeholder="Send a command to this agent..."
            className="h-8 text-sm bg-background"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-primary"
            onClick={handleSendCommand}
            disabled={!chatInput.trim()}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
