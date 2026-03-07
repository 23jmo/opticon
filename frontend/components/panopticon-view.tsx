"use client";

import { useState, useEffect, useRef } from "react";
import { Agent, ThinkingEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Grid,
  List,
  Play,
  Pause,
  RotateCcw,
  Settings,
  Maximize2,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";

interface AgentThumbnail {
  agentId: string;
  thumbnail: string;
  timestamp: number;
}

interface PanopticonViewProps {
  agents: Agent[];
  thinkingEntries: ThinkingEntry[];
  onSelectAgent: (agentId: string) => void;
  onToggleMode: () => void;
  className?: string;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "active":
      return <Activity className="size-3 text-emerald-400" />;
    case "booting":
      return <Loader2 className="size-3 animate-spin text-amber-400" />;
    case "terminated":
      return <CheckCircle2 className="size-3 text-zinc-600" />;
    case "error":
      return <XCircle className="size-3 text-red-400" />;
    default:
      return <Clock className="size-3 text-amber-400" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "booting":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "terminated":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
    case "error":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
}

function AgentTile({
  agent,
  thumbnail,
  lastActivity,
  onSelect
}: {
  agent: Agent;
  thumbnail: AgentThumbnail | null;
  lastActivity: ThinkingEntry | null;
  onSelect: () => void;
}) {
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    return `${Math.floor(diff / 3600000)}h`;
  };

  return (
    <button
      onClick={onSelect}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-card/80 active:scale-98"
    >
      {/* Thumbnail */}
      <div className="aspect-video w-full overflow-hidden bg-zinc-900">
        {thumbnail?.thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail.thumbnail}`}
            alt={`${agent.name} desktop`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : agent.streamUrl ? (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs text-zinc-500">
            Loading preview...
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-xs text-zinc-500">
            Booting...
          </div>
        )}

        {/* Status overlay */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/80 backdrop-blur-sm px-2 py-1">
          {getStatusIcon(agent.status)}
          <span className="text-[10px] font-medium text-white">
            {agent.name.replace("agent-", "Agent ")}
          </span>
        </div>

        {/* Activity indicator */}
        {agent.status === "active" && (
          <div className="absolute top-2 right-2 size-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse" />
        )}
      </div>

      {/* Info footer */}
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={cn("text-[10px] h-5", getStatusColor(agent.status))}
          >
            {agent.status}
          </Badge>
          {thumbnail && (
            <span className="text-[10px] text-muted-foreground">
              {formatTime(thumbnail.timestamp)}
            </span>
          )}
        </div>

        {lastActivity && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <div className="size-1 rounded-full bg-primary/60" />
            <span className="line-clamp-1">
              {lastActivity.reasoning || lastActivity.action}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

export function PanopticonView({
  agents,
  thinkingEntries,
  onSelectAgent,
  onToggleMode,
  className
}: PanopticonViewProps) {
  const [thumbnails, setThumbnails] = useState<Map<string, AgentThumbnail>>(new Map());
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Handle thumbnail updates from socket events
  useEffect(() => {
    const handleThumbnailUpdate = (agentId: string, thumbnail: string, timestamp: number) => {
      setThumbnails(prev => new Map(prev).set(agentId, { agentId, thumbnail, timestamp }));
    };

    // This would be connected to the socket in the parent component
    // For now, we'll simulate updates
    return () => {
      // Cleanup socket listener
    };
  }, []);

  const getLastActivity = (agentId: string) => {
    return thinkingEntries
      .filter(entry => entry.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0] || null;
  };

  const activeAgents = agents.filter(a => a.status !== "terminated").length;
  const totalTasks = agents.reduce((sum, a) => (a.tasksCompleted || 0) + sum, 0);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Panopticon</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{activeAgents} active</span>
            <span>•</span>
            <span>{totalTasks} tasks done</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? (
              <List className="size-4" />
            ) : (
              <Grid className="size-4" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onToggleMode}
          >
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
            {agents.map(agent => (
              <AgentTile
                key={agent.id}
                agent={agent}
                thumbnail={thumbnails.get(agent.id) || null}
                lastActivity={getLastActivity(agent.id)}
                onSelect={() => onSelectAgent(agent.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map(agent => {
              const thumbnail = thumbnails.get(agent.id);
              const lastActivity = getLastActivity(agent.id);

              return (
                <button
                  key={agent.id}
                  onClick={() => onSelectAgent(agent.id)}
                  className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card/50 p-4 text-left transition-all hover:border-primary/50 hover:bg-card/80"
                >
                  {/* Thumbnail */}
                  <div className="size-16 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    {thumbnail?.thumbnail ? (
                      <img
                        src={`data:image/jpeg;base64,${thumbnail.thumbnail}`}
                        alt={`${agent.name} desktop`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-zinc-500">
                        {agent.status === "booting" ? "..." : "—"}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(agent.status)}
                      <span className="font-medium">
                        {agent.name.replace("agent-", "Agent ")}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] h-5", getStatusColor(agent.status))}
                      >
                        {agent.status}
                      </Badge>
                    </div>

                    {lastActivity && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {lastActivity.reasoning || lastActivity.action}
                      </p>
                    )}

                    {thumbnail && (
                      <span className="text-[11px] text-muted-foreground">
                        Updated {formatTime(thumbnail.timestamp)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  function formatTime(timestamp: number) {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }
}