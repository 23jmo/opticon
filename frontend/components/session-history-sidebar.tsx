"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, CheckCircle2, Circle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Todo {
  id: string;
  sessionId: string;
  description: string;
  status: string;
  assignedTo: string | null;
  result: string | null;
}

interface Session {
  id: string;
  userId: string;
  prompt: string;
  agentCount: number;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  todos: Todo[];
}

interface SessionHistorySidebarProps {
  onClose: () => void;
}

export function SessionHistorySidebar({ onClose }: SessionHistorySidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch("/api/sessions/history");
        if (!response.ok) {
          throw new Error("Failed to fetch session history");
        }
        const data = await response.json();
        setSessions(data.sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "running":
      case "pending_approval":
        return <Circle className="h-4 w-4 text-primary" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Circle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "running":
        return "bg-primary/10 text-primary border-primary/20";
      case "pending_approval":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "failed":
        return "bg-destructive/10 text-destructive border-destructive/20";
      default:
        return "bg-muted/10 text-muted-foreground border-muted/20";
    }
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const handleSessionClick = (session: Session) => {
    if (session.status === "completed") {
      router.push(`/session/${session.id}/summary`);
    } else {
      router.push(`/session/${session.id}`);
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Session History</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No sessions yet
            </div>
          )}

          {!loading &&
            !error &&
            sessions.map((session) => {
              const completedTodos = session.todos.filter(
                (t) => t.status === "completed"
              ).length;
              const totalTodos = session.todos.length;

              return (
                <button
                  key={session.id}
                  onClick={() => handleSessionClick(session)}
                  className={cn(
                    "w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                >
                  {/* Prompt */}
                  <p className="line-clamp-2 text-sm font-medium">
                    {session.prompt}
                  </p>

                  {/* Status + Task Count */}
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("gap-1", getStatusColor(session.status))}
                    >
                      {getStatusIcon(session.status)}
                      {session.status.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {completedTodos}/{totalTodos} tasks
                    </span>
                  </div>

                  {/* Timestamp */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(session.createdAt)}
                  </p>
                </button>
              );
            })}
        </div>
      </ScrollArea>
    </div>
  );
}
