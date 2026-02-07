"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Socket } from "socket.io-client";
import {
  Agent,
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
import {
  MOCK_PROMPT,
  MOCK_AGENTS,
  MOCK_THINKING_ENTRIES,
  MOCK_AGENT_ACTIVITIES,
} from "@/lib/mock-data";
import { PromptBar } from "@/components/prompt-bar";
import { AgentBrowser } from "@/components/agent-browser";
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
  const [isLoading, setIsLoading] = useState(!isMock);
  const [error, setError] = useState<string | null>(null);

  // Mock mode: simulate streaming thinking entries
  useEffect(() => {
    if (!isMock) return;

    const activeAgentIds = new Set(agents.map((a) => a.id));
    const relevantEntries = MOCK_THINKING_ENTRIES.filter((e) =>
      activeAgentIds.has(e.agentId)
    );

    const timers: NodeJS.Timeout[] = [];
    relevantEntries.forEach((entry, index) => {
      // First few entries appear quickly, then slow to a realistic pace
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
          if (data.agents) {
            setAgents(data.agents);
            if (data.agents.length > 0) {
              setActiveTab(data.agents[0].id);
            }
          }
          if (data.status === "completed") {
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
        socket.emit("join-session", sessionId);
      });

      socket.on("task:created", (data: TaskCreatedEvent) => {
        // Tasks tracked separately if needed
        void data;
      });

      socket.on("task:assigned", (data: TaskAssignedEvent) => {
        void data;
      });

      socket.on("task:completed", (data: { taskId: string }) => {
        void data;
      });

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
        void data;
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
  }, [sessionId, isMock]);

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
      {/* Accent gradient line */}
      <div className="h-0.5 shrink-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />

      {/* Prompt bar */}
      <PromptBar prompt={prompt} agentCount={agents.length} />

      {/* Main content: browser + thinking sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent browser */}
        <div className="flex-1 p-3 min-w-0">
          <AgentBrowser
            agents={agents}
            activeAgentId={activeTab}
            onTabChange={setActiveTab}
            agentActivities={MOCK_AGENT_ACTIVITIES}
          />
        </div>

        {/* Thinking sidebar */}
        <div className="w-[360px] shrink-0">
          <ThinkingSidebar
            entries={thinkingEntries}
            agents={agents}
            agentActivities={MOCK_AGENT_ACTIVITIES}
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
