"use client";

import { useRouter } from "next/navigation";
import { Task, Agent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, ArrowLeft } from "lucide-react";

interface SessionSummaryProps {
  sessionId: string;
  tasks: Task[];
  agents: Agent[];
  whiteboard?: string;
}

export function SessionSummary({
  sessionId,
  tasks,
  agents,
  whiteboard,
}: SessionSummaryProps) {
  const router = useRouter();
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const tasksByAgent = agents.reduce(
    (acc, agent) => {
      acc[agent.id] = tasks.filter(
        (t) => t.assignedTo === agent.id && t.status === "completed"
      );
      return acc;
    },
    {} as Record<string, Task[]>
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="size-8 text-emerald-400" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Session Complete</h1>
            <p className="text-sm text-muted-foreground">
              All agents have finished their work
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">
              {completedTasks.length}
              <span className="text-muted-foreground">/{tasks.length}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Tasks Done</p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{agents.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agents Used</p>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div className="text-center">
            <p className="font-mono text-sm text-muted-foreground pt-1.5">
              {sessionId.slice(0, 8)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Session ID</p>
          </div>
        </div>

        {/* Agent cards */}
        <div className="grid gap-3 sm:grid-cols-2">
          {agents.map((agent) => {
            const agentTasks = tasksByAgent[agent.id] || [];
            return (
              <Card key={agent.id} className="bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      Agent {agent.id.slice(0, 6)}
                    </CardTitle>
                    <Badge variant="secondary" className="text-[11px]">
                      {agentTasks.length} task
                      {agentTasks.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {agentTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {agentTasks.map((task) => (
                        <li
                          key={task.id}
                          className="flex items-start gap-2"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                          <span className="text-sm text-muted-foreground leading-snug">
                            {task.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground/60">
                      No tasks completed
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Whiteboard */}
        {whiteboard && (
          <Card className="bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Whiteboard</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed font-mono">
                {whiteboard}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Return button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => router.push("/")}
            className="gap-2"
          >
            <ArrowLeft className="size-3.5" />
            New Session
          </Button>
        </div>
      </div>
    </div>
  );
}
