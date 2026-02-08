"use client";

import { useState } from "react";
import { Agent } from "@/lib/types";
import { AgentActivity } from "@/lib/mock-data";
import { AgentScreen } from "./agent-screen";
import { VMTab } from "./vm-tab";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AgentGridProps {
  agents: Agent[];
  agentActivities: Record<string, AgentActivity>;
  onSelectAgent: (agentId: string) => void;
  onAgentCommand?: (agentId: string, message: string) => void;
  sessionId?: string;
}

export function AgentGrid({
  agents,
  agentActivities,
  onSelectAgent,
  onAgentCommand,
  sessionId,
}: AgentGridProps) {
  const isMock = sessionId === "demo";
  const gridCols =
    agents.length <= 1
      ? "grid-cols-1"
      : agents.length <= 2
        ? "grid-cols-2"
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
          isMock={isMock}
          sessionId={sessionId}
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
  isMock: boolean;
  sessionId?: string;
}

function AgentGridCell({
  agent,
  activity,
  onSelect,
  onCommand,
  isMock,
  sessionId,
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
      {/* Stream area — positioned container for VMTab */}
      <div className="relative flex-1 overflow-hidden">
        {/* Clickable overlay — above VMTab's z-20 non-interactive overlay */}
        <button
          onClick={onSelect}
          className="absolute inset-0 z-30 cursor-pointer"
          aria-label={`View ${activity?.label || agent.name} in full screen`}
        />

        {/* Agent label */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-sm px-2 py-1 pointer-events-none">
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
            {activity?.label || agent.name}
          </span>
        </div>

        {/* Stream or mock screen */}
        {!isMock && agent.streamUrl ? (
          <VMTab
            agentId={agent.id}
            sessionId={sessionId || ""}
            streamUrl={agent.streamUrl}
            isActive={true}
            isInteractive={false}
          />
        ) : (
          <AgentScreen
            agentId={agent.id}
            activity={activity}
            status={agent.status}
          />
        )}
      </div>

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
