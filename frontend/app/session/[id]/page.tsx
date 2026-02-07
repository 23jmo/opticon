"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import {
  Agent,
  Task,
  ThinkingEntry,
  TaskCreatedEvent,
  TaskAssignedEvent,
  AgentThinkingEvent,
  AgentReasoningEvent,
  AgentStreamReadyEvent,
  AgentTerminatedEvent,
  SessionCompleteEvent,
} from "@/lib/types";
import { createSessionSocket } from "@/lib/socket-client";
import { VMTab } from "@/components/vm-tab";
import { ThinkingPanel } from "@/components/thinking-panel";
import { SessionSummary } from "@/components/session-summary";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const socketRef = useRef<Socket | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [thinkingEntries, setThinkingEntries] = useState<
    Record<string, ThinkingEntry[]>
  >({});
  const [activeTab, setActiveTab] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [sessionData, setSessionData] = useState<SessionCompleteEvent | null>(
    null
  );

  useEffect(() => {
    if (!sessionId) return;

    const fetchSessionStatus = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.agents) {
            setAgents(data.agents);
            if (data.agents.length > 0) {
              setActiveTab(data.agents[0].id);
            }
          }
          if (data.tasks) {
            setTasks(data.tasks);
          }
          if (data.status === "completed") {
            setIsSessionComplete(true);
            setSessionData({
              sessionId,
              tasks: data.tasks || [],
              agents: data.agents || [],
            });
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Continue with Socket.io connection
      }

      const socket = createSessionSocket(sessionId);
      socketRef.current = socket;

      socket.on("connect", () => {
        setIsLoading(false);
        setError(null);
      });

      socket.on("connect_error", () => {
        setError("Failed to connect to session");
        setIsLoading(false);
      });

      socket.on("reconnect", () => {
        socket.emit("join-session", sessionId);
      });

      // Task events
      socket.on("task:created", (data: TaskCreatedEvent) => {
        setTasks((prev) => [...prev, data.task]);
      });

      socket.on("task:assigned", (data: TaskAssignedEvent) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === data.taskId
              ? {
                  ...task,
                  status: "assigned" as const,
                  assignedTo: data.agentId,
                }
              : task
          )
        );
      });

      socket.on("task:completed", (data: { taskId: string }) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === data.taskId
              ? { ...task, status: "completed" as const }
              : task
          )
        );
      });

      // Agent events
      socket.on(
        "agent:initialized",
        (data: { agentId: string; sessionId: string }) => {
          const newAgent: Agent = {
            id: data.agentId,
            sessionId: data.sessionId,
            status: "initializing",
          };
          setAgents((prev) => {
            const updated = [...prev, newAgent];
            setActiveTab((current) => current || updated[0].id);
            return updated;
          });
        }
      );

      socket.on("agent:stream-ready", (data: AgentStreamReadyEvent) => {
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === data.agentId
              ? {
                  ...agent,
                  streamUrl: data.streamUrl,
                  status: "active" as const,
                }
              : agent
          )
        );
      });

      socket.on("agent:thinking", (data: AgentThinkingEvent) => {
        const entry: ThinkingEntry = {
          id: `${data.agentId}-${Date.now()}-${Math.random()}`,
          agentId: data.agentId,
          timestamp: data.timestamp,
          action: data.action,
        };
        setThinkingEntries((prev) => ({
          ...prev,
          [data.agentId]: [...(prev[data.agentId] || []), entry],
        }));
      });

      socket.on("agent:reasoning", (data: AgentReasoningEvent) => {
        if (data.actionId) {
          setThinkingEntries((prev) => ({
            ...prev,
            [data.agentId]: (prev[data.agentId] || []).map((entry) =>
              entry.id === data.actionId
                ? { ...entry, reasoning: data.reasoning }
                : entry
            ),
          }));
        } else {
          setThinkingEntries((prev) => {
            const entries = prev[data.agentId] || [];
            const lastEntry = entries[entries.length - 1];
            if (lastEntry && !lastEntry.reasoning) {
              return {
                ...prev,
                [data.agentId]: entries.map((entry, idx) =>
                  idx === entries.length - 1
                    ? { ...entry, reasoning: data.reasoning }
                    : entry
                ),
              };
            }
            return {
              ...prev,
              [data.agentId]: [
                ...entries,
                {
                  id: `${data.agentId}-${Date.now()}-${Math.random()}`,
                  agentId: data.agentId,
                  timestamp: data.timestamp,
                  action: "Reasoning",
                  reasoning: data.reasoning,
                },
              ],
            };
          });
        }
      });

      socket.on("agent:terminated", (data: AgentTerminatedEvent) => {
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === data.agentId
              ? { ...agent, status: "terminated" as const }
              : agent
          )
        );
      });

      socket.on("session:complete", (data: SessionCompleteEvent) => {
        setIsSessionComplete(true);
        setSessionData(data);
      });

      setIsLoading(false);
    };

    fetchSessionStatus();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId]);

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const progressPercent =
    tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;
  const activeAgentCount = agents.filter((a) => a.status === "active").length;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Connecting to session...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Return home
          </button>
        </div>
      </div>
    );
  }

  if (isSessionComplete && sessionData) {
    return (
      <SessionSummary
        sessionId={sessionId}
        tasks={sessionData.tasks}
        agents={sessionData.agents}
      />
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Initializing agents...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Accent gradient line */}
      <div className="h-0.5 shrink-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

      {/* Header */}
      <div className="shrink-0 border-b border-border px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold">
              Session{" "}
              <span className="font-mono text-muted-foreground">
                {sessionId.slice(0, 8)}
              </span>
            </h1>

            <div className="hidden sm:flex items-center gap-3">
              <div className="h-4 w-px bg-border" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedCount}/{tasks.length} tasks
              </span>
              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <Badge variant="outline" className="gap-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {activeAgentCount} active
          </Badge>
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-border px-5 py-2">
        <div className="flex gap-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setActiveTab(agent.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === agent.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  agent.status === "active"
                    ? "bg-emerald-400"
                    : agent.status === "terminated"
                      ? "bg-zinc-600"
                      : "bg-amber-400 animate-pulse"
                }`}
              />
              Agent {agent.id.slice(0, 6)}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`flex-1 overflow-hidden ${
              activeTab === agent.id ? "flex" : "hidden"
            }`}
          >
            <div className="flex-1 overflow-hidden">
              <VMTab
                agentId={agent.id}
                sessionId={sessionId}
                streamUrl={agent.streamUrl}
                isActive={activeTab === agent.id}
              />
            </div>
            <div className="w-80 shrink-0 overflow-hidden">
              <ThinkingPanel
                agentId={agent.id}
                sessionId={sessionId}
                entries={thinkingEntries[agent.id] || []}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
