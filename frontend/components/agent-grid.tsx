"use client";

import { useState } from "react";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AgentGridProps {
  agents: Agent[];
  agentActivities: Record<string, AgentActivity>;
  onSelectAgent: (agentId: string) => void;
  onAgentCommand?: (agentId: string, message: string) => void;
}

export function AgentGrid({
  agents,
  agentActivities,
  onSelectAgent,
  onAgentCommand,
}: AgentGridProps) {
  const gridCols =
    agents.length <= 1
      ? "grid-cols-1"
      : agents.length === 2
        ? "grid-cols-2"
        : agents.length === 3
          ? "grid-cols-3"
          : "grid-cols-2";

  return (
    <div className={cn("grid h-full gap-2 p-2", gridCols)}>
      {agents.map((agent) => (
        <AgentGridCell
          key={agent.id}
          agent={agent}
          activity={agentActivities[agent.id]}
          onSelect={() => onSelectAgent(agent.id)}
          onCommand={(message) => onAgentCommand?.(agent.id, message)}
        />
      ))}
    </div>
  );
}

interface AgentGridCellProps {
  agent: Agent;
  activity: AgentActivity;
  onSelect: () => void;
  onCommand: (message: string) => void;
}

function AgentGridCell({
  agent,
  activity,
  onSelect,
  onCommand,
}: AgentGridCellProps) {
  const [chatInput, setChatInput] = useState("");

  const handleSend = () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setChatInput("");
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* Agent label overlay — clickable to switch to tab view */}
      <button
        onClick={onSelect}
        className="relative flex-1 overflow-hidden group cursor-pointer"
      >
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1">
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
          <span className="text-[10px] font-medium text-white">
            {activity?.label || `Agent ${agent.id.slice(0, 6)}`}
          </span>
        </div>
        <div className="h-full group-hover:opacity-90 transition-opacity">
          <AgentScreen
            agentId={agent.id}
            activity={activity}
            status={agent.status}
          />
        </div>
      </button>

      {/* Compact chat input */}
      <div className="shrink-0 border-t border-border bg-card px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Command..."
            className="h-7 text-xs bg-background"
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground hover:text-primary"
            onClick={handleSend}
            disabled={!chatInput.trim()}
          >
            <Send className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
