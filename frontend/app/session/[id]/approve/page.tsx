"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Todo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/kanban-board";

export default function ApprovePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [tasks, setTasks] = useState<Todo[]>([]);
  const [agentCount, setAgentCount] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error("Session not found");
        }
        const data = await response.json();

        if (data.status !== "pending_approval") {
          router.push(`/session/${sessionId}`);
          return;
        }

        setTasks(data.todos || []);
        setAgentCount(data.agentCount || 2);
        setPrompt(data.prompt || "");
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
        setIsLoading(false);
      }
    }

    fetchSession();
  }, [sessionId, router]);

  const handleApprove = useCallback(
    async (approvedTasks: Todo[], approvedAgentCount: number) => {
      const validTasks = approvedTasks.filter(
        (t) => t.description.trim().length > 0
      );
      if (validTasks.length === 0) return;

      setIsApproving(true);
      setError(null);

      try {
        const response = await fetch(`/api/sessions/${sessionId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tasks: validTasks.map((t) => ({
              id: t.id,
              description: t.description.trim(),
            })),
            agentCount: approvedAgentCount,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to approve session");
        }

        router.push(`/session/${sessionId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setIsApproving(false);
      }
    },
    [sessionId, router]
  );

  const handleCancel = useCallback(() => {
    router.push("/");
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => router.push("/")}>
            Return home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="gap-2 border-zinc-800 bg-zinc-900/80 text-zinc-400"
          >
            <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
            Review Tasks
          </Badge>
          <p className="text-sm text-muted-foreground leading-relaxed truncate max-w-xl">
            {prompt}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="relative z-10 mx-6 mt-4 animate-slide-in rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Kanban board */}
      <div className="relative z-10 flex-1 min-h-0">
        <KanbanBoard
          initialTasks={tasks}
          initialAgentCount={agentCount}
          onApprove={handleApprove}
          isApproving={isApproving}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
