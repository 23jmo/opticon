"use client";

import { useEffect, useState, useRef, Suspense, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import {
  Agent,
  Todo,
  ThinkingEntry,
  TaskAssignedEvent,
  AgentThinkingEvent,
  AgentReasoningEvent,
  AgentStreamReadyEvent,
  AgentTerminatedEvent,
  AgentJoinEvent,
  AgentErrorEvent,
  TaskCompletedEvent,
  WhiteboardUpdatedEvent,
  ReplayReadyEvent,
} from "@/lib/types";
import { createSessionSocket } from "@/lib/socket-client";
import {
  MOCK_PROMPT,
  MOCK_AGENTS,
  MOCK_THINKING_ENTRIES,
  MOCK_AGENT_ACTIVITIES,
} from "@/lib/mock-data";
import { PromptBar } from "@/components/prompt-bar";
import { AgentBrowser } from "@/components/agent-browser";
import { AgentGrid } from "@/components/agent-grid";
import { ThinkingSidebar } from "@/components/thinking-sidebar";
import { Loader2 } from "lucide-react";

function SessionContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = params.id as string;
  const isMock = sessionId === "demo";

  const prompt = searchParams.get("prompt") || MOCK_PROMPT;
  const agentCountParam = parseInt(searchParams.get("agents") || "4", 10);

  const socketRef = useRef<Socket | null>(null);

  const [agents, setAgents] = useState<Agent[]>(
    isMock ? MOCK_AGENTS.slice(0, agentCountParam) : []
  );
  const [activeTab, setActiveTab] = useState(
    isMock ? MOCK_AGENTS[0].id : ""
  );
  const [thinkingEntries, setThinkingEntries] = useState<ThinkingEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [whiteboard, setWhiteboard] = useState<string>("");
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(!isMock);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tabs" | "grid">("tabs");
  const [replays, setReplays] = useState<Record<string, { manifestUrl: string; frameCount: number }>>({});

  const handleStop = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("session:stop", { sessionId });
    }
    // Update all agents to terminated
    setAgents((prev) =>
      prev.map((agent) => ({ ...agent, status: "terminated" as const }))
    );
  }, [sessionId]);

  const handleAgentCommand = useCallback(
    (agentId: string, message: string) => {
      if (socketRef.current) {
        socketRef.current.emit("agent:command", { agentId, message });
      }
    },
    []
  );

  const handleGridSelectAgent = useCallback(
    (agentId: string) => {
      setActiveTab(agentId);
      setViewMode("tabs");
    },
    []
  );

  // Mock mode: simulate streaming thinking entries
  useEffect(() => {
    if (!isMock) return;

    const activeAgentIds = new Set(agents.map((a) => a.id));
    const relevantEntries = MOCK_THINKING_ENTRIES.filter((e) =>
      activeAgentIds.has(e.agentId)
    );

    const timers: NodeJS.Timeout[] = [];
    relevantEntries.forEach((entry, index) => {
      const delay =
        index < 4 ? 400 + index * 600 : 2800 + (index - 4) * 1800;

      timers.push(
        setTimeout(() => {
          setThinkingEntries((prev) => [...prev, entry]);
        }, delay)
      );
    });

    return () => timers.forEach(clearTimeout);
  }, [isMock, agents]);

  // Real mode: Socket.io connection
  useEffect(() => {
    if (isMock || !sessionId) return;

    const fetchAndConnect = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === "pending_approval") {
            router.push(`/session/${sessionId}/approve`);
            return;
          }
          if (data.agents) {
            setAgents(data.agents);
            if (data.agents.length > 0) {
              setActiveTab(data.agents[0].id);
            }
          }
          if (data.todos) {
            setTodos(data.todos);
          }
          if (data.whiteboard) {
            setWhiteboard(data.whiteboard);
          }
          if (data.status === "completed") {
            setSessionComplete(true);
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Continue with socket connection
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
        socket.emit("session:join", sessionId);
      });

      socket.on("task:created", (data: Todo) => {
        setTodos((prev) => [...prev, data]);
      });

      socket.on("task:assigned", (data: TaskAssignedEvent) => {
        setTodos((prev) =>
          prev.map((t) =>
            t.id === data.todoId
              ? { ...t, status: "assigned" as const, assignedTo: data.agentId }
              : t
          )
        );
      });

      socket.on("task:completed", (data: TaskCompletedEvent) => {
        setTodos((prev) =>
          prev.map((t) =>
            t.id === data.todoId
              ? { ...t, status: "completed" as const, result: data.result }
              : t
          )
        );
        setAgents((prev) =>
          prev.map((a) =>
            a.id === data.agentId
              ? { ...a, tasksCompleted: (a.tasksCompleted || 0) + 1 }
              : a
          )
        );
      });

      socket.on("agent:join", (data: AgentJoinEvent) => {
        const newAgent: Agent = {
          id: data.agentId,
          name: data.agentId,
          sessionId: data.sessionId,
          status: "booting",
          currentTaskId: null,
        };
        setAgents((prev) => {
          if (prev.find((a) => a.id === data.agentId)) return prev;
          const updated = [...prev, newAgent];
          setActiveTab((current) => current || updated[0].id);
          return updated;
        });
      });

      socket.on("agent:stream_ready", (data: AgentStreamReadyEvent) => {
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
          id: data.actionId || `${data.agentId}-${Date.now()}-${Math.random()}`,
          agentId: data.agentId,
          timestamp: data.timestamp,
          action: data.action,
          isError: data.isError,
          toolName: data.toolName,
          toolArgs: data.toolArgs,
        };
        setThinkingEntries((prev) => [...prev, entry]);
      });

      socket.on("agent:reasoning", (data: AgentReasoningEvent) => {
        if (data.actionId) {
          setThinkingEntries((prev) =>
            prev.map((entry) =>
              entry.id === data.actionId
                ? { ...entry, reasoning: data.reasoning }
                : entry
            )
          );
        } else {
          setThinkingEntries((prev) => {
            const lastEntry = prev[prev.length - 1];
            if (
              lastEntry &&
              lastEntry.agentId === data.agentId &&
              !lastEntry.reasoning
            ) {
              return prev.map((entry, idx) =>
                idx === prev.length - 1
                  ? { ...entry, reasoning: data.reasoning }
                  : entry
              );
            }
            return [
              ...prev,
              {
                id: `${data.agentId}-${Date.now()}-${Math.random()}`,
                agentId: data.agentId,
                timestamp: data.timestamp,
                action: "Reasoning",
                reasoning: data.reasoning,
              },
            ];
          });
        }
      });

      socket.on("agent:error", (data: AgentErrorEvent) => {
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === data.agentId
              ? { ...agent, status: "error" as const }
              : agent
          )
        );
        setThinkingEntries((prev) => [
          ...prev,
          {
            id: `${data.agentId}-error-${Date.now()}-${Math.random()}`,
            agentId: data.agentId,
            timestamp: new Date().toISOString(),
            action: `Error: ${data.error}`,
            isError: true,
          },
        ]);
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

      socket.on("whiteboard:updated", (data: WhiteboardUpdatedEvent) => {
        setWhiteboard(data.content);
      });

      socket.on("replay:ready", (data: ReplayReadyEvent) => {
        setReplays((prev) => ({
          ...prev,
          [data.agentId]: {
            manifestUrl: data.manifestUrl,
            frameCount: data.frameCount,
          },
        }));
      });

      socket.on("session:complete", () => {
        setSessionComplete(true);
      });

      setIsLoading(false);
    };

    fetchAndConnect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId, isMock, router]);

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
      {/* Completion banner */}
      {sessionComplete && (
        <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-400 font-medium">
            All agents have completed their tasks
          </p>
          <button
            onClick={() => router.push(`/session/${sessionId}/summary`)}
            className="text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            View Summary
          </button>
        </div>
      )}

      {/* Prompt bar */}
      <PromptBar
        prompt={prompt}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onStop={handleStop}
      />

      {/* Main content: browser/grid + thinking sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent view */}
        <div className="flex-1 p-3 min-w-0">
          {viewMode === "tabs" ? (
            <AgentBrowser
              agents={agents}
              activeAgentId={activeTab}
              onTabChange={setActiveTab}
              agentActivities={MOCK_AGENT_ACTIVITIES}
              sessionId={sessionId}
              whiteboard={whiteboard}
              onAgentCommand={handleAgentCommand}
              replays={replays}
            />
          ) : (
            <AgentGrid
              agents={agents}
              agentActivities={MOCK_AGENT_ACTIVITIES}
              onSelectAgent={handleGridSelectAgent}
              onAgentCommand={handleAgentCommand}
            />
          )}
        </div>

        {/* Thinking sidebar */}
        <div className="w-[360px] shrink-0">
          <ThinkingSidebar
            entries={thinkingEntries}
            agents={agents}
            activeAgentId={activeTab}
          />
        </div>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="mx-auto size-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading session...</p>
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SessionContent />
    </Suspense>
  );
}
