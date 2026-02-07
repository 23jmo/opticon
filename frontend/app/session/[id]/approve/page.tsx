"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Todo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
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
  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);

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

  const handleRefine = useCallback(async () => {
    if (!refinementInput.trim()) return;

    setIsRefining(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refinement: refinementInput.trim(),
          currentTasks: tasks.map((t) => t.description),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to refine tasks");
      }

      const data = await response.json();
      setTasks(data.todos || []);
      setRefinementInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refine tasks");
    } finally {
      setIsRefining(false);
    }
  }, [sessionId, refinementInput, tasks]);

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
    <div className="relative min-h-screen">
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-6xl space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <Badge
              variant="outline"
              className="gap-2 border-zinc-800 bg-zinc-900/80 text-zinc-400"
            >
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              Review Tasks
            </Badge>
            <h1 className="text-2xl font-bold">Approve Task Breakdown</h1>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {prompt}
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="animate-slide-in rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Kanban board */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              <KanbanBoard
                initialTasks={tasks}
                initialAgentCount={agentCount}
                onApprove={handleApprove}
                isApproving={isApproving}
                onCancel={handleCancel}
              />
            </div>
          </div>

          {/* Refinement input */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
            <label className="text-sm font-medium text-zinc-400">
              Refine tasks (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={refinementInput}
                onChange={(e) => setRefinementInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleRefine();
                  }
                }}
                placeholder="Add more tasks, modify existing ones, or change the approach..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isRefining}
              />
              <Button
                onClick={handleRefine}
                disabled={isRefining || !refinementInput.trim()}
                className="gap-2"
              >
                {isRefining ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Refine
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
