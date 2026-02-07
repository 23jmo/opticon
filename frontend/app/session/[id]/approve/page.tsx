"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Todo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Plus, GripVertical } from "lucide-react";

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

  const handleUpdateTask = (index: number, description: string) => {
    setTasks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, description } : t))
    );
  };

  const handleRemoveTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        description: "",
        status: "pending" as const,
        assignedTo: null,
      },
    ]);
  };

  const handleApprove = async () => {
    const validTasks = tasks.filter((t) => t.description.trim().length > 0);
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
          agentCount,
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
  };

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
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="dot-grid absolute inset-0 pointer-events-none" />

      <main className="relative z-10 w-full max-w-2xl px-6 py-12">
        <div className="space-y-8">
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
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {prompt}
            </p>
          </div>

          {/* Task list */}
          <div className="space-y-2">
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className="group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
              >
                <GripVertical className="size-4 mt-2 text-zinc-700 shrink-0" />
                <span className="text-xs text-zinc-600 mt-2 shrink-0 font-mono tabular-nums w-5">
                  {index + 1}.
                </span>
                <textarea
                  value={task.description}
                  onChange={(e) => handleUpdateTask(index, e.target.value)}
                  className="flex-1 bg-transparent text-sm text-zinc-200 resize-none outline-none placeholder:text-zinc-600 min-h-[40px] leading-relaxed"
                  placeholder="Describe the task..."
                  rows={2}
                />
                <button
                  onClick={() => handleRemoveTask(index)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-destructive transition-all mt-2"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <button
              onClick={handleAddTask}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 py-3 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              <Plus className="size-3.5" />
              Add task
            </button>
          </div>

          {/* Agent count */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <span className="text-sm text-zinc-400">Agent count</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAgentCount(n)}
                  className={`flex size-8 items-center justify-center rounded-md text-xs font-medium transition-all ${
                    agentCount === n
                      ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="animate-slide-in rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={
                isApproving ||
                tasks.filter((t) => t.description.trim()).length === 0
              }
              className="gap-2"
            >
              {isApproving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                `Start with ${agentCount} agent${agentCount !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
