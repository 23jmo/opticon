import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  addAgent,
  assignTask,
  completeTask,
  getNextPendingTask,
  getSession,
  updateAgentStatus,
} from "./session-store";
import { getIO } from "./socket";
import type { Agent } from "./types";

// Track worker processes per session
const workerProcesses = new Map<string, Map<string, ChildProcess>>();

const PROJECT_ROOT = path.resolve(__dirname, "../..");

export function spawnWorkers(sessionId: string, agentCount: number): void {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const sessionWorkers = new Map<string, ChildProcess>();
  workerProcesses.set(sessionId, sessionWorkers);

  for (let i = 0; i < agentCount; i++) {
    const agentId = uuidv4();
    const agent: Agent = {
      id: agentId,
      sessionId,
      status: "booting",
      currentTaskId: null,
    };
    addAgent(sessionId, agent);

    const task = getNextPendingTask(sessionId);
    if (!task) {
      console.warn(
        `[worker-manager] No pending task for agent ${agentId}, skipping spawn`
      );
      continue;
    }

    assignTask(sessionId, task.id, agentId);

    try {
      const io = getIO();
      io.to(`session:${sessionId}`).emit("task:assigned", {
        todoId: task.id,
        agentId,
      });
    } catch {
      console.warn("[worker-manager] Socket.io not available, skipping emit");
    }

    const workerProcess = spawn("python3", ["workers/worker.py"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SESSION_ID: sessionId,
        AGENT_ID: agentId,
        TASK_ID: task.id,
        TASK_DESCRIPTION: task.description,
        SOCKET_URL: `http://localhost:${process.env.PORT || "3000"}`,
        E2B_API_KEY: process.env.E2B_API_KEY || "",
        DEDALUS_API_KEY: process.env.DEDALUS_API_KEY || "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    sessionWorkers.set(agentId, workerProcess);
    console.log(
      `[worker-manager] Spawned worker for agent ${agentId} (pid: ${workerProcess.pid})`
    );

    // Parse stdout JSON lines
    const rl = createInterface({ input: workerProcess.stdout! });
    rl.on("line", (line) => {
      try {
        const message = JSON.parse(line);
        handleWorkerMessage(sessionId, agentId, message);
      } catch {
        // Non-JSON output, log as plain text
        console.log(`[worker:${agentId}] ${line}`);
      }
    });

    // Log stderr
    workerProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[worker:${agentId}:stderr] ${data.toString().trim()}`);
    });

    workerProcess.on("exit", (code) => {
      console.log(`[worker-manager] Agent ${agentId} exited with code ${code}`);
      sessionWorkers.delete(agentId);
      updateAgentStatus(sessionId, agentId, "terminated");

      try {
        const io = getIO();
        io.to(`session:${sessionId}`).emit("agent:terminated", { agentId });
        checkSessionComplete(sessionId);
      } catch {
        // Socket.io may not be available
      }
    });
  }
}

function handleWorkerMessage(
  sessionId: string,
  agentId: string,
  message: Record<string, unknown>
): void {
  let io;
  try {
    io = getIO();
  } catch {
    return;
  }

  const room = `session:${sessionId}`;

  switch (message.type) {
    case "log":
      if (message.action) {
        io.to(room).emit("agent:thinking", {
          agentId,
          action: message.action as string,
          timestamp: Date.now(),
        });
      }
      if (message.reasoning) {
        io.to(room).emit("agent:reasoning", {
          agentId,
          reasoning: message.reasoning as string,
          timestamp: Date.now(),
        });
      }
      break;

    case "complete": {
      const todoId = message.todoId as string;
      const result = message.result as string | undefined;
      completeTask(sessionId, todoId, result);

      io.to(room).emit("task:completed", { todoId, agentId, result });

      // Try to assign next task
      const nextTask = getNextPendingTask(sessionId);
      if (nextTask) {
        assignTask(sessionId, nextTask.id, agentId);
        io.to(room).emit("task:assigned", {
          todoId: nextTask.id,
          agentId,
        });
        // Send next task to worker via stdin
        const sessionWorkers = workerProcesses.get(sessionId);
        const proc = sessionWorkers?.get(agentId);
        if (proc?.stdin?.writable) {
          proc.stdin.write(
            JSON.stringify({
              taskId: nextTask.id,
              description: nextTask.description,
            }) + "\n"
          );
        }
      } else {
        updateAgentStatus(sessionId, agentId, "terminated");
        io.to(room).emit("agent:terminated", { agentId });
        checkSessionComplete(sessionId);
      }
      break;
    }

    case "sandbox_ready": {
      const session = getSession(sessionId);
      if (!session) break;
      const agent = session.agents.find((a) => a.id === agentId);
      if (agent) {
        agent.sandboxId = message.sandboxId as string;
        agent.streamUrl = message.streamUrl as string;
      }
      io.to(room).emit("agent:thinking", {
        agentId,
        action: `Sandbox ready: ${message.sandboxId}`,
        timestamp: Date.now(),
      });
      break;
    }
  }
}

function checkSessionComplete(sessionId: string): void {
  const session = getSession(sessionId);
  if (!session) return;

  const allTerminated = session.agents.every(
    (a) => a.status === "terminated"
  );
  const allCompleted = session.todos.every((t) => t.status === "completed");

  if (allTerminated && allCompleted) {
    session.status = "completed";
    try {
      const io = getIO();
      io.to(`session:${sessionId}`).emit("session:complete", { sessionId });
    } catch {
      // Socket.io may not be available
    }
    console.log(`[worker-manager] Session ${sessionId} complete`);

    // Clean up worker process map
    workerProcesses.delete(sessionId);
  }
}

export function killAllWorkers(sessionId: string): void {
  const sessionWorkers = workerProcesses.get(sessionId);
  if (!sessionWorkers) return;

  for (const [agentId, proc] of sessionWorkers) {
    console.log(`[worker-manager] Killing worker ${agentId}`);
    proc.kill("SIGTERM");
    updateAgentStatus(sessionId, agentId, "terminated");
  }

  workerProcesses.delete(sessionId);
}
