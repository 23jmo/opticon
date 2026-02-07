"use client";

import { useEffect, useState, useRef, use } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { VMTab } from "@/components/vm-tab";
import { ThinkingPanel } from "@/components/thinking-panel";
import { SessionSummary } from "@/components/session-summary";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SessionPage() {
  const params = use(useParams());
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

  // Initialize Socket.io connection and set up event listeners
  useEffect(() => {
    if (!sessionId) return;

    // First, try to fetch session status for reconnection
    const fetchSessionStatus = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          // Restore state from session data if available
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
      } catch (err) {
        console.error("Failed to fetch session status:", err);
        // Continue with Socket.io connection anyway
      }

      // Set up Socket.io connection
      const socket = createSessionSocket(sessionId);
      socketRef.current = socket;

      // Set up event listeners
      socket.on("connect", () => {
        console.log("Connected to session:", sessionId);
        setIsLoading(false);
        setError(null);
      });

      socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err);
        setError("Failed to connect to session. Please try again.");
        setIsLoading(false);
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from session");
      });

      socket.on("reconnect", () => {
        console.log("Reconnected to session");
        // Re-join session room
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
              ? { ...task, status: "assigned" as const, assignedTo: data.agentId }
              : task
          )
        );
      });

      socket.on("task:completed", (data: { taskId: string }) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === data.taskId ? { ...task, status: "completed" as const } : task
          )
        );
      });

      // Agent events
      socket.on("agent:initialized", (data: { agentId: string; sessionId: string }) => {
        const newAgent: Agent = {
          id: data.agentId,
          sessionId: data.sessionId,
          status: "initializing",
        };
        setAgents((prev) => {
          const updated = [...prev, newAgent];
          if (!activeTab && updated.length > 0) {
            setActiveTab(updated[0].id);
          }
          return updated;
        });
      });

      socket.on("agent:stream-ready", (data: AgentStreamReadyEvent) => {
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === data.agentId
              ? { ...agent, streamUrl: data.streamUrl, status: "active" as const }
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
          // Update existing entry with reasoning
          setThinkingEntries((prev) => ({
            ...prev,
            [data.agentId]: (prev[data.agentId] || []).map((entry) =>
              entry.id === data.actionId
                ? { ...entry, reasoning: data.reasoning }
                : entry
            ),
          }));
        } else {
          // Create new entry or append to last entry
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

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId, activeTab]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center space-y-2">
          <Loader2 className="mx-auto size-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-400">Connecting to session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Return to home
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-center space-y-2">
          <Loader2 className="mx-auto size-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-400">Waiting for agents to initialize...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-black">
      <div className="border-b bg-white px-4 py-3 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Session {sessionId.slice(0, 8)}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {tasks.filter((t) => t.status === "completed").length} / {tasks.length}{" "}
              tasks completed
            </p>
          </div>
          <Badge variant="secondary">
            {agents.filter((a) => a.status === "active").length} active
          </Badge>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-4 mt-4 w-fit">
          {agents.map((agent) => (
            <TabsTrigger key={agent.id} value={agent.id}>
              Agent {agent.id.slice(0, 8)}
              {agent.status === "active" && (
                <span className="ml-1 size-1.5 rounded-full bg-green-500" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex flex-1 overflow-hidden">
          {agents.map((agent) => (
            <TabsContent
              key={agent.id}
              value={agent.id}
              className="m-0 flex flex-1 gap-0 overflow-hidden data-[state=active]:flex"
            >
              <div className="flex flex-1 overflow-hidden">
                <div className="flex flex-1">
                  <VMTab
                    agentId={agent.id}
                    sessionId={sessionId}
                    streamUrl={agent.streamUrl}
                    isActive={activeTab === agent.id}
                  />
                </div>
                <div className="w-80 shrink-0">
                  <ThinkingPanel
                    agentId={agent.id}
                    sessionId={sessionId}
                    entries={thinkingEntries[agent.id] || []}
                  />
                </div>
              </div>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
