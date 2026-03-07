"use client";

import { cn } from "@/lib/utils";
import {
  getStatusTag,
  formatRelativeTime,
} from "@/lib/session-utils";

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

interface SessionCardProps {
  session: SessionData;
  liveThumbnail?: string;
  onSelect: () => void;
}

export function SessionCard({
  session,
  liveThumbnail,
  onSelect,
}: SessionCardProps) {
  const thumbnail = liveThumbnail || session.latestThumbnail;
  const tag = getStatusTag(session.status);
  const completedTodos = session.todos.filter(
    (t) => t.status === "completed"
  ).length;
  const totalTodos = session.todos.length;
  const currentTask = session.todos.find(
    (t) => t.status === "assigned"
  );
  const isActive =
    session.status === "running" ||
    session.status === "decomposing" ||
    session.status === "pending_approval" ||
    session.status === "paused";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card/60 text-left transition-all min-h-[180px]",
        "hover:border-zinc-600 hover:bg-card/80 hover:shadow-lg hover:shadow-black/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "active:scale-[0.98]"
      )}
    >
      {/* Thumbnail area */}
      <div className="relative h-[100px] w-full overflow-hidden bg-zinc-900">
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt=""
            className="h-full w-full object-cover transition-opacity duration-500"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <span className="text-2xl text-zinc-700/50 font-bold">
              {session.prompt.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Live / Paused indicator */}
        {isActive && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
            {session.status === "paused" ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-medium text-amber-400">
                  PAUSED
                </span>
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-medium text-cyan-400">
                  LIVE
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col justify-between p-3 gap-2">
        <p className="line-clamp-2 text-sm leading-snug text-zinc-300 group-hover:text-zinc-100 transition-colors">
          {session.prompt}
        </p>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
              tag.className
            )}
          >
            {tag.label}
          </span>
          <span className="text-[11px] text-zinc-600">
            {formatRelativeTime(session.createdAt)}
            {totalTodos > 0 && (
              <>
                {" \u00B7 "}
                {completedTodos}/{totalTodos} tasks
              </>
            )}
          </span>
        </div>

        {/* Current task description for running sessions */}
        {isActive && currentTask && (
          <p className="text-[11px] text-zinc-500 line-clamp-1">
            {currentTask.description}
          </p>
        )}
      </div>
    </button>
  );
}
