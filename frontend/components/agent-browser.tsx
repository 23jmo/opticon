"use client";

import { useState } from "react";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { Send, Ellipsis, X } from "lucide-react";
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
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-border">
        {agents.map((agent, i) => {
          const isActive = agent.id === activeAgentId;

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
              {/* Number badge */}
              <span className="flex items-center justify-center size-5 rounded-full border border-border text-[11px] tabular-nums shrink-0">
                {i + 1}
              </span>

              {/* Agent name */}
              <span className="truncate font-medium">
                {agent.id}
              </span>

              {/* Menu + close */}
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
