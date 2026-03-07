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
  AgentPausedEvent,
  AgentSandboxExpiredEvent,
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
import { ThinkingBottomSheet } from "@/components/thinking-bottom-sheet";
import { useIsDesktop, useIsMobile } from "@/hooks/use-media-query";
import { Loader2 } from "lucide-react";

function SessionContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = params.id as string;
  const isMock = sessionId === "demo";

  const agentCountParam = parseInt(searchParams.get("agents") || "4", 10);

  const [prompt, setPrompt] = useState(
    searchParams.get("prompt") || (isMock ? MOCK_PROMPT : "")
  );

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
  const [tasksDone, setTasksDone] = useState(false);
  const [isLoading, setIsLoading] = useState(!isMock);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tabs" | "grid">("tabs");
  const [replays, setReplays] = useState<Record<string, { manifestUrl: string; frameCount: number }>>({});
  const [isStopping, setIsStopping] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();

  const handleStop = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("session:stop", { sessionId });
    }
    // Mark agents as stopping — don't set sessionComplete yet.
    // Workers need time to save replays before the session is truly done.
    // session:complete will arrive from the server once all workers finish.
    setIsStopping(true);
    setAgents((prev) =>
      prev.map((agent) =>
        agent.status === "terminated"
          ? agent
          : { ...agent, status: "stopping" as const }
      )
    );
  }, [sessionId]);

  const handleFinish = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("session:finish", { sessionId });
    }
    setSessionComplete(true);
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

  // Mock mode: simulate streaming thinking entries + demo replays
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

    // After 8 seconds, "terminate" agents 1 & 2 and give them mock replays
    timers.push(
      setTimeout(() => {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === "agent-001" || a.id === "agent-002"
              ? { ...a, status: "terminated" as const }
              : a
          )
        );
        setReplays({
          "agent-001": {
            manifestUrl: "/api/replay/mock-manifest?agent=agent-001&frames=20",
            frameCount: 20,
          },
          "agent-002": {
            manifestUrl: "/api/replay/mock-manifest?agent=agent-002&frames=15",
            frameCount: 15,
          },
        });
      }, 8000)
    );

    return () => timers.forEach(clearTimeout);
  }, [isMock, agents]);

  // Real mode: Socket.io connection
  useEffect(() => {
    if (isMock || !sessionId) return;

    const fetchAndConnect = async () => {
      try {
        let response = await fetch(`/api/sessions/${sessionId}`);

        // If not in memory, try recovery from DB
        if (response.status === 404) {
          setIsRecovering(true);
          response = await fetch(`/api/sessions/${sessionId}/recover`);
          setIsRecovering(false);
        }

        if (response.ok) {
          const data = await response.json();
          if (data.status === "pending_approval") {
            router.push(`/session/${sessionId}/approve`);
            return;
          }
          if (data.prompt) {
            setPrompt(data.prompt);
          }
          if (data.agents) {
            setAgents(data.agents);
            if (data.agents.length > 0) {
              setActiveTab(data.agents[0].id);
            }
            // Check if all sandboxes are expired
            const allExpired = data.agents.length > 0 && data.agents.every(
              (a: Agent) => a.status === "expired" || a.status === "terminated"
            );
            if (allExpired && data.status !== "completed") {
              setSessionExpired(true);
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
        setIsRecovering(false);
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
        setTodos((prev) => {
          const updated = prev.map((t) =>
            t.id === data.todoId
              ? { ...t, status: "completed" as const, result: data.result }
              : t
          );
          // Check if all tasks are now done
          if (updated.length > 0 && updated.every((t) => t.status === "completed")) {
            setTasksDone(true);
          }
          return updated;
        });
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
        setThinkingEntries((prev) => {
          if (prev.some((e) => e.id === entry.id)) return prev;
          return [...prev, entry];
        });
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

      socket.on("agent:paused", (data: AgentPausedEvent) => {
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === data.agentId
              ? { ...agent, status: "paused" as const, sandboxId: data.sandboxId }
              : agent
          )
        );
      });

      socket.on("agent:sandbox_expired", (data: AgentSandboxExpiredEvent) => {
        setAgents((prev) => {
          const updated = prev.map((agent) =>
            agent.id === data.agentId
              ? { ...agent, status: "expired" as const }
              : agent
          );
          // Check if all sandboxes are now dead
          if (updated.every((a) => a.status === "expired" || a.status === "terminated")) {
            setSessionExpired(true);
          }
          return updated;
        });
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

      socket.on("session:tasks_done", () => {
        setTasksDone(true);
      });

      socket.on("session:complete", () => {
        setIsStopping(false);
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

  const effectiveViewMode = isMobile ? "tabs" : viewMode;

  return (
    <div className="flex h-screen flex-col">
      {/* Recovering banner */}
      {isRecovering && (
        <div className="shrink-0 border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-2 lg:px-5 lg:py-3 flex items-center gap-2 lg:gap-3">
          <Loader2 className="size-3.5 lg:size-4 animate-spin text-cyan-400" />
          <p className="text-xs lg:text-sm text-cyan-400 font-medium">
            Reconnecting to session...
          </p>
        </div>
      )}

      {/* Session expired banner */}
      {sessionExpired && !sessionComplete && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 lg:px-5 lg:py-3 flex items-center justify-between">
          <p className="text-xs lg:text-sm text-amber-400 font-medium">
            Session expired — sandboxes timed out
          </p>
          <button
            onClick={() => router.push(`/session/${sessionId}/summary`)}
            className="text-xs lg:text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors border border-amber-500/30 rounded-md px-2 lg:px-3 py-1 shrink-0"
          >
            View Results
          </button>
        </div>
      )}

      {/* Stopping banner */}
      {isStopping && !sessionComplete && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 lg:px-5 lg:py-3 flex items-center gap-2 lg:gap-3">
          <Loader2 className="size-3.5 lg:size-4 animate-spin text-amber-400" />
          <p className="text-xs lg:text-sm text-amber-400 font-medium">
            Stopping — saving replays...
          </p>
        </div>
      )}

      {/* Completion banner */}
      {sessionComplete && (
        <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 lg:px-5 lg:py-3 flex items-center justify-between">
          <p className="text-xs lg:text-sm text-emerald-400 font-medium">
            Session finished
          </p>
          <button
            onClick={() => router.push(`/session/${sessionId}/summary`)}
            className="text-xs lg:text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            View Summary
          </button>
        </div>
      )}

      {/* Tasks done banner */}
      {tasksDone && !sessionComplete && (
        <div className="shrink-0 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2 lg:px-5 lg:py-3 flex items-center justify-between">
          <p className="text-xs lg:text-sm text-emerald-400 font-medium line-clamp-1">
            All tasks completed — standing by for follow-ups
          </p>
          <button
            onClick={handleFinish}
            className="text-xs lg:text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors border border-emerald-500/30 rounded-md px-2 lg:px-3 py-1 shrink-0"
          >
            Finish
          </button>
        </div>
      )}

      {/* Prompt bar */}
      <PromptBar
        prompt={prompt}
        viewMode={effectiveViewMode}
        onViewModeChange={setViewMode}
        onStop={handleStop}
        tasksComplete={tasksDone || sessionComplete || isStopping}
        isMobile={isMobile}
        onFollowUp={(text) => {
          if (socketRef.current) {
            socketRef.current.emit("session:followup", { sessionId, prompt: text });
            setTasksDone(false);
          }
        }}
      />

      {/* Main content: browser/grid + thinking sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent view */}
        <div className="flex-1 p-2 lg:p-3 min-w-0">
          {effectiveViewMode === "tabs" ? (
            <AgentBrowser
              agents={agents}
              activeAgentId={activeTab}
              onTabChange={setActiveTab}
              agentActivities={MOCK_AGENT_ACTIVITIES}
              sessionId={sessionId}
              whiteboard={whiteboard}
              onAgentCommand={handleAgentCommand}
              replays={replays}
              compact={isMobile}
            />
          ) : (
            <AgentGrid
              agents={agents}
              agentActivities={MOCK_AGENT_ACTIVITIES}
              onSelectAgent={handleGridSelectAgent}
              onAgentCommand={handleAgentCommand}
              sessionId={sessionId}
            />
          )}
        </div>

        {/* Thinking sidebar — desktop only */}
        {isDesktop && (
          <div className="w-[360px] shrink-0">
            <ThinkingSidebar
              entries={thinkingEntries}
              agents={agents}
              activeAgentId={activeTab}
            />
          </div>
        )}
      </div>

      {/* Thinking bottom sheet — mobile only */}
      {!isDesktop && (
        <ThinkingBottomSheet
          entries={thinkingEntries}
          agents={agents}
          activeAgentId={activeTab}
        />
      )}
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
