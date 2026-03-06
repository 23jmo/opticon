"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import { createSessionSocket } from "@/lib/socket-client";
import { PanopticonView } from "@/components/panopticon-view";
import { SessionHistorySidebar } from "@/components/session-history-sidebar";
import { Agent, ThinkingEntry, AgentThinkingEvent, AgentStreamReadyEvent, AgentThumbnailEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  History,
  Search,
  Wifi,
  WifiOff,
  Settings,
  Bell,
  Power,
  PlayCircle,
  PauseCircle,
  RotateCcw,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PanopticonSession {
  id: string;
  prompt: string;
  agentCount: number;
  status: string;
  createdAt: Date;
  agents: Agent[];
  activeTasks: number;
  completedTasks: number;
  totalTasks: number;
}

// AgentThumbnailEvent is imported from types.ts

export default function PanopticonPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PanopticonSession[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [thinkingEntries, setThinkingEntries] = useState<ThinkingEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<Map<string, AgentThumbnailEvent>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const socketRef = useRef<Socket | null>(null);

  // Load Panopticon sessions
  useEffect(() => {
    loadSessions();
  }, []);

  // Connect to socket for real-time updates
  useEffect(() => {
    if (!activeSession) return;

    const socket = createSessionSocket(activeSession);
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("agent:stream_ready", (data: AgentStreamReadyEvent) => {
      setAgents(prev => prev.map(agent =>
        agent.id === data.agentId
          ? { ...agent, streamUrl: data.streamUrl, status: "active" as const }
          : agent
      ));
    });

    socket.on("agent:thinking", (data: AgentThinkingEvent) => {
      const entry: ThinkingEntry = {
        id: data.actionId || `${data.agentId}-${Date.now()}-${Math.random()}`,
        agentId: data.agentId,
        timestamp: data.timestamp,
        action: data.action,
        isError: data.isError,
        toolName: data.toolName,
        toolArgs: data.toolArgs,
      };
      setThinkingEntries(prev => {
        if (prev.some(e => e.id === entry.id)) return prev;
        return [...prev, entry];
      });
    });

    socket.on("agent:thumbnail", (data: { agentId: string; thumbnail: string; timestamp: number }) => {
      setThumbnails(prev => new Map(prev).set(data.agentId, {
        agentId: data.agentId,
        thumbnail: data.thumbnail,
        timestamp: data.timestamp,
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeSession]);

  const loadSessions = async () => {
    try {
      const response = await fetch("/api/panopticon");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);

        // Auto-connect to the most recent active session
        const activeSession = data.sessions.find((s: PanopticonSession) => s.status === "running");
        if (activeSession && !activeSession) {
          setActiveSession(activeSession.id);
          setAgents(activeSession.agents);
        }
      }
    } catch (error) {
      console.error("Failed to load Panopticon sessions:", error);
    }
  };

  const createNewSession = async () => {
    if (!newPrompt.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/panopticon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: newPrompt,
          agentCount: 4,
          enablePersistence: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewPrompt("");
        setActiveSession(data.sessionId);
        loadSessions();
      }
    } catch (error) {
      console.error("Failed to create Panopticon session:", error);
    }
    setIsCreating(false);
  };

  const selectSession = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setActiveSession(sessionId);
      setAgents(session.agents);
      setThinkingEntries([]); // Reset thinking entries
      setThumbnails(new Map()); // Reset thumbnails
    }
  };

  const handleAgentSelect = (agentId: string) => {
    if (activeSession) {
      router.push(`/session/${activeSession}?agent=${agentId}&view=tabs`);
    }
  };

  const filteredSessions = sessions.filter(session =>
    session.prompt.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(date).toLocaleDateString();
  };

  const getSessionStatus = (session: PanopticonSession) => {
    if (session.status === "running") {
      const activeAgents = session.agents.filter(a => a.status === "active").length;
      return `${activeAgents} agents active`;
    }
    return session.status;
  };

  const activeSessionData = sessions.find(s => s.id === activeSession);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Panopticon</h1>
          <Badge variant={isConnected ? "default" : "destructive"} className="h-5">
            {isConnected ? (
              <>
                <Wifi className="size-3 mr-1" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="size-3 mr-1" />
                Offline
              </>
            )}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(true)}
          >
            <History className="size-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Session List */}
        <div className="w-80 flex flex-col border-r border-border">
          {/* Search & Create */}
          <div className="p-4 space-y-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Start a new long-running task..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    createNewSession();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={createNewSession}
                disabled={!newPrompt.trim() || isCreating}
                size="icon"
              >
                {isCreating ? (
                  <RotateCcw className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Session List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {filteredSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => selectSession(session.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    activeSession === session.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium line-clamp-2">
                      {session.prompt}
                    </span>
                    {session.status === "running" && (
                      <div className="size-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{formatTime(session.createdAt)}</span>
                    <span>•</span>
                    <span>{session.completedTasks}/{session.totalTasks} tasks</span>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px] h-4">
                      {getSessionStatus(session)}
                    </Badge>
                    {session.agentCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {session.agentCount} agents
                      </Badge>
                    )}
                  </div>
                </button>
              ))}

              {filteredSessions.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {searchQuery ? "No matching sessions" : "No Panopticon sessions yet"}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main View */}
        <div className="flex-1 flex flex-col">
          {activeSessionData ? (
            <PanopticonView
              agents={agents}
              thinkingEntries={thinkingEntries}
              onSelectAgent={handleAgentSelect}
              onToggleMode={() => router.push(`/session/${activeSession}`)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="size-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <PlayCircle className="size-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Welcome to Panopticon</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create long-running AI agent sessions that you can monitor from anywhere.
                    Perfect for complex research, analysis, and knowledge work tasks.
                  </p>
                </div>
                <Button
                  onClick={() => setNewPrompt("Research the latest developments in AI agent orchestration and create a comprehensive report")}
                  variant="outline"
                >
                  Try an example task
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Sidebar */}
      <SessionHistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}