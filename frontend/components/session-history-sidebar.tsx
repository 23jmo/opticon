"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

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
  isOpen: boolean;
  onClose: () => void;
}

function getTimeGroup(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7Days = new Date(startOfToday.getTime() - 7 * 86400000);
  const startOf30Days = new Date(startOfToday.getTime() - 30 * 86400000);

  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  if (d >= startOf7Days) return "Previous 7 Days";
  if (d >= startOf30Days) return "Previous 30 Days";
  return "Older";
}

function groupSessionsByTime(sessions: Session[]): { group: string; sessions: Session[] }[] {
  const order = ["Today", "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"];
  const map = new Map<string, Session[]>();

  for (const session of sessions) {
    const group = getTimeGroup(session.createdAt);
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(session);
  }

  return order.filter((g) => map.has(g)).map((g) => ({ group: g, sessions: map.get(g)! }));
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "running":
    case "pending_approval":
      return "bg-cyan-400";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-zinc-500";
  }
}

function getStatusTag(status: string): { label: string; className: string } {
  switch (status) {
    case "completed":
      return { label: "Finished", className: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" };
    case "running":
      return { label: "Running", className: "bg-cyan-400/10 text-cyan-400 ring-cyan-400/20" };
    case "pending_approval":
      return { label: "Processing", className: "bg-amber-400/10 text-amber-400 ring-amber-400/20" };
    case "failed":
      return { label: "Failed", className: "bg-red-500/10 text-red-400 ring-red-500/20" };
    default:
      return { label: "Pending", className: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20" };
  }
}

const easing = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

export function SessionHistorySidebar({ isOpen, onClose }: SessionHistorySidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;

    async function fetchHistory() {
      try {
        setLoading(true);
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
  }, [isOpen]);

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
    onClose();
    if (session.status === "completed") {
      router.push(`/session/${session.id}/summary`);
    } else {
      router.push(`/session/${session.id}`);
    }
  };

  const grouped = groupSessionsByTime(sessions);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-30 bg-black/20"
            onClick={onClose}
          />

          {/* Sidebar panel */}
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ duration: 0.25, ease: easing }}
            className="fixed left-0 top-0 z-40 flex h-screen w-[280px] flex-col border-r border-zinc-800/50 bg-zinc-950"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-300">History</h2>
              <button
                onClick={onClose}
                className="flex size-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Body */}
            <ScrollArea className="flex-1">
              <div className="px-2 pb-4">
                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-zinc-600" />
                  </div>
                )}

                {error && (
                  <div className="mx-2 rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                    {error}
                  </div>
                )}

                {!loading && !error && sessions.length === 0 && (
                  <div className="py-8 text-center text-[13px] text-zinc-600">
                    No sessions yet
                  </div>
                )}

                {!loading &&
                  !error &&
                  grouped.map((group) => {
                    let itemIndex = 0;
                    return (
                      <div key={group.group} className="mt-4 first:mt-2">
                        <div className="px-3 pb-1.5 text-[11px] font-medium text-zinc-600">
                          {group.group}
                        </div>
                        {group.sessions.map((session) => {
                          const completedTodos = session.todos.filter(
                            (t) => t.status === "completed"
                          ).length;
                          const totalTodos = session.todos.length;
                          const currentIndex = itemIndex++;

                          const tag = getStatusTag(session.status);

                          return (
                            <motion.button
                              key={session.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{
                                duration: 0.2,
                                delay: currentIndex * 0.03,
                                ease: easing,
                              }}
                              onClick={() => handleSessionClick(session)}
                              className={cn(
                                "group flex w-full items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors",
                                "hover:bg-zinc-800/60",
                                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-2 size-1.5 shrink-0 rounded-full opacity-70",
                                  getStatusDotColor(session.status)
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-sm leading-snug text-zinc-300 transition-colors group-hover:text-zinc-100">
                                  {session.prompt}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2">
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
                                        {" · "}
                                        {completedTodos}/{totalTodos} tasks
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
