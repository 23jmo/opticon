"use client";

import { Task, Agent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

interface SessionSummaryProps {
  sessionId: string;
  tasks: Task[];
  agents: Agent[];
}

export function SessionSummary({ sessionId, tasks, agents }: SessionSummaryProps) {
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const tasksByAgent = agents.reduce((acc, agent) => {
    acc[agent.id] = tasks.filter(
      (t) => t.assignedTo === agent.id && t.status === "completed"
    );
    return acc;
  }, {} as Record<string, Task[]>);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Session Complete
            </h1>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            All agents have finished their tasks
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent) => {
            const agentTasks = tasksByAgent[agent.id] || [];
            return (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Agent {agent.id.slice(0, 8)}</CardTitle>
                    <Badge variant="secondary">
                      {agentTasks.length} task{agentTasks.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {agentTasks.length > 0 ? (
                      <ul className="space-y-2">
                        {agentTasks.map((task) => (
                          <li
                            key={task.id}
                            className="flex items-start gap-2 text-sm"
                          >
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                            <span className="text-zinc-700 dark:text-zinc-300">
                              {task.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No tasks completed
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Total Tasks:
                </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {completedTasks.length} / {tasks.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Active Agents:
                </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {agents.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Session ID:
                </span>
                <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {sessionId}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
