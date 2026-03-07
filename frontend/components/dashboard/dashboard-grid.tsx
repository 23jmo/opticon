"use client";

import { SessionCard } from "./session-card";
import { Plus } from "lucide-react";

interface Todo {
  id: string;
  description: string;
  status: string;
}

interface SessionData {
  id: string;
  prompt: string;
  status: string;
  createdAt: Date;
  todos: Todo[];
  latestThumbnail?: string;
}

interface DashboardGridProps {
  sessions: SessionData[];
  thumbnails: Map<string, string>;
  onSelectSession: (sessionId: string, status: string) => void;
  onNewTask: () => void;
}

export function DashboardGrid({
  sessions,
  thumbnails,
  onSelectSession,
  onNewTask,
}: DashboardGridProps) {
  const activeSessions = sessions.filter(
    (s) =>
      s.status === "running" ||
      s.status === "decomposing" ||
      s.status === "pending_approval"
  );
  const recentSessions = sessions
    .filter(
      (s) =>
        s.status !== "running" &&
        s.status !== "decomposing" &&
        s.status !== "pending_approval"
    )
    .slice(0, 10);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-zinc-800/60 border border-zinc-700/50">
          <Plus className="size-7 text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-400 mb-1">No sessions yet</p>
        <p className="text-xs text-zinc-600">
          Start your first task to see it here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Active
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                liveThumbnail={thumbnails.get(session.id)}
                onSelect={() =>
                  onSelectSession(session.id, session.status)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Recent
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {recentSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onSelect={() =>
                  onSelectSession(session.id, session.status)
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile FAB */}
      <button
        onClick={onNewTask}
        className="fixed bottom-20 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-105 active:scale-95 lg:hidden"
      >
        <Plus className="size-6" />
      </button>
    </div>
  );
}
