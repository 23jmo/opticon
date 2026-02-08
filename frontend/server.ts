import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./lib/socket";
import {
  getSession,
  addTodos,
  assignTask,
  completeTask,
  getNextPendingTask,
  updateAgentStatus,
  updateAgentStreamUrl,
  updateWhiteboard,
  getWhiteboard,
} from "./lib/session-store";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  AgentJoinEvent,
  AgentStreamReadyEvent,
  AgentThinkingEvent,
  AgentReasoningEvent,
  AgentErrorEvent,
  TaskCompletedEvent,
  AgentTerminatedEvent,
  WhiteboardUpdatedEvent,
  SessionFollowUpEvent,
  ReplayCompleteEvent,
} from "./lib/types";
import {
  persistTodoStatus,
  persistTodos,
  persistSessionStatus,
} from "./lib/db/session-persist";
import { persistReplay } from "./lib/db/replay-persist";
import { decomposeTasks } from "./lib/orchestrator";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

/** 5-minute idle shutdown timers, keyed by sessionId */
const idleTimers = new Map<string, NodeJS.Timeout>();

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: "*",
      },
    }
  );

  setIO(io);

  /**
   * Start (or restart) the 5-minute idle shutdown timer for a session.
   * When the timer fires, the session truly completes.
   */
  function startIdleTimer(sessionId: string): void {
    // Clear any existing timer
    clearIdleTimer(sessionId);

    console.log(
      `[server] Session ${sessionId} — starting 5-min idle shutdown timer`
    );

    const timer = setTimeout(() => {
      idleTimers.delete(sessionId);
      finalizeSession(sessionId);
    }, IDLE_TIMEOUT_MS);

    idleTimers.set(sessionId, timer);
  }

  function clearIdleTimer(sessionId: string): void {
    const existing = idleTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      idleTimers.delete(sessionId);
      console.log(
        `[server] Session ${sessionId} — cleared idle shutdown timer`
      );
    }
  }

  /**
   * Finalize a session: set status to completed, emit session:complete,
   * tell workers to stop, and persist.
   */
  function finalizeSession(sessionId: string): void {
    const session = getSession(sessionId);
    if (!session || session.status === "completed" || session.status === "failed") return;

    const room = `session:${sessionId}`;
    session.status = "completed";

    io.to(room).emit("session:complete", { sessionId });
    io.to(room).emit("task:none");

    console.log(`[server] Session ${sessionId} — finalized (idle timeout or manual)`);

    persistSessionStatus(sessionId, "completed", new Date()).catch(
      console.error
    );
  }

  /**
   * Assign tasks to idle agents in a session. Used both after initial
   * stream_ready and after follow-up decomposition.
   */
  function assignTasksToIdleAgents(sessionId: string): void {
    const session = getSession(sessionId);
    if (!session) return;

    const idleAgents = session.agents.filter(
      (a) => a.status === "idle" || a.status === "active"
    ).filter((a) => !a.currentTaskId);

    for (const agent of idleAgents) {
      const nextTask = getNextPendingTask(sessionId);
      if (!nextTask) break;

      assignTask(sessionId, nextTask.id, agent.id);
      io.to(`session:${sessionId}`).emit("task:assigned", {
        todoId: nextTask.id,
        agentId: agent.id,
      });

      // Send task to the specific worker socket
      const whiteboard = getWhiteboard(sessionId);
      const room = `session:${sessionId}`;
      io.to(room).emit("task:assign", {
        taskId: nextTask.id,
        description: nextTask.description,
        whiteboard,
      });
    }
  }

  io.on("connection", (socket) => {
    console.log(`[socket.io] Client connected: ${socket.id}`);

    // --- Browser client events ---
    socket.on("session:join", (sessionId) => {
      socket.join(`session:${sessionId}`);
      console.log(`[socket.io] ${socket.id} joined session:${sessionId}`);
    });

    socket.on("session:leave", (sessionId) => {
      socket.leave(`session:${sessionId}`);
      console.log(`[socket.io] ${socket.id} left session:${sessionId}`);
    });

    socket.on("session:stop", (data: { sessionId: string }) => {
      const { sessionId } = data;
      const session = getSession(sessionId);
      if (!session) return;

      console.log(`[socket.io] Stopping session ${sessionId}`);

      // Clear any idle timer
      clearIdleTimer(sessionId);

      // Mark all agents as terminated
      session.agents.forEach((agent) => {
        updateAgentStatus(sessionId, agent.id, "terminated");
      });

      // Tell all workers to stop
      io.to(`session:${sessionId}`).emit("task:none");

      // Notify browser clients
      session.agents.forEach((agent) => {
        io.to(`session:${sessionId}`).emit("agent:terminated", {
          agentId: agent.id,
        });
      });

      // Mark session as failed (user-stopped)
      session.status = "failed";
      persistSessionStatus(sessionId, "failed", new Date()).catch(
        console.error
      );

      console.log(`[server] Session ${sessionId} stopped by user`);
    });

    socket.on("session:finish", (data: { sessionId: string }) => {
      const { sessionId } = data;
      console.log(`[socket.io] Finishing session ${sessionId}`);
      clearIdleTimer(sessionId);
      finalizeSession(sessionId);
    });

    // --- Follow-up instructions from browser ---
    socket.on("session:followup", async (data: SessionFollowUpEvent) => {
      const { sessionId, prompt } = data;
      const session = getSession(sessionId);
      if (!session || session.status === "completed" || session.status === "failed") return;

      console.log(
        `[server] Session ${sessionId} — received follow-up: "${prompt}"`
      );

      // Clear the idle timer since new work is coming
      clearIdleTimer(sessionId);

      // Decompose the follow-up prompt
      try {
        const idleAgentCount = session.agents.filter(
          (a) => a.status === "idle" || a.status === "active"
        ).filter((a) => !a.currentTaskId).length;
        const targetCount = Math.max(idleAgentCount, 1);

        const descriptions = await decomposeTasks(prompt, targetCount);
        const newTodos = addTodos(sessionId, descriptions);

        // Persist new todos
        persistTodos(sessionId, newTodos).catch(console.error);

        // Emit task:created for each new todo
        const room = `session:${sessionId}`;
        for (const todo of newTodos) {
          io.to(room).emit("task:created", todo);
        }

        // Assign new tasks to idle agents
        assignTasksToIdleAgents(sessionId);

        console.log(
          `[server] Session ${sessionId} — follow-up decomposed into ${newTodos.length} tasks`
        );
      } catch (error) {
        console.error(
          `[server] Session ${sessionId} — failed to decompose follow-up:`,
          error
        );
      }
    });

    // --- Worker events ---

    socket.on("agent:join", (data: AgentJoinEvent) => {
      const { sessionId, agentId } = data;
      socket.join(`session:${sessionId}`);
      console.log(`[socket.io] Worker ${agentId} joined session:${sessionId}`);

      // Forward to browser clients
      const room = `session:${sessionId}`;
      io.to(room).emit("agent:join", { agentId, sessionId });
    });

    socket.on("agent:stream_ready", (data: AgentStreamReadyEvent) => {
      // Find session from rooms
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      const { agentId, streamUrl } = data;
      updateAgentStreamUrl(sessionId, agentId, streamUrl);
      updateAgentStatus(sessionId, agentId, "active");

      // Forward to browser clients
      io.to(`session:${sessionId}`).emit("agent:stream_ready", {
        agentId,
        streamUrl,
      });

      // Assign first task to this agent
      const nextTask = getNextPendingTask(sessionId);
      if (nextTask) {
        assignTask(sessionId, nextTask.id, agentId);
        io.to(`session:${sessionId}`).emit("task:assigned", {
          todoId: nextTask.id,
          agentId,
        });

        // Send task to worker
        const whiteboard = getWhiteboard(sessionId);
        socket.emit("task:assign", {
          taskId: nextTask.id,
          description: nextTask.description,
          whiteboard,
        });
      }
      // Agent idles if no pending tasks — don't terminate
    });

    socket.on("agent:thinking", (data: AgentThinkingEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      io.to(`session:${sessionId}`).emit("agent:thinking", {
        agentId: data.agentId,
        action: data.action,
        timestamp: data.timestamp || new Date().toISOString(),
        isError: data.isError,
        actionId: data.actionId,
        toolName: data.toolName,
        toolArgs: data.toolArgs,
      });
    });

    socket.on("agent:reasoning", (data: AgentReasoningEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      io.to(`session:${sessionId}`).emit("agent:reasoning", {
        agentId: data.agentId,
        reasoning: data.reasoning,
        timestamp: data.timestamp || new Date().toISOString(),
        actionId: data.actionId,
      });
    });

    socket.on("agent:error", (data: AgentErrorEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      updateAgentStatus(sessionId, data.agentId, "error");
      io.to(`session:${sessionId}`).emit("agent:error", {
        agentId: data.agentId,
        error: data.error,
      });
    });

    socket.on("task:completed", (data: TaskCompletedEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      const { todoId, agentId, result } = data;
      completeTask(sessionId, todoId, result);

      // Persist todo completion to database
      persistTodoStatus(todoId, "completed", result).catch(console.error);

      io.to(`session:${sessionId}`).emit("task:completed", {
        todoId,
        agentId,
        result,
      });

      // Try to assign next task
      const nextTask = getNextPendingTask(sessionId);
      if (nextTask) {
        assignTask(sessionId, nextTask.id, agentId);
        io.to(`session:${sessionId}`).emit("task:assigned", {
          todoId: nextTask.id,
          agentId,
        });

        const whiteboard = getWhiteboard(sessionId);
        socket.emit("task:assign", {
          taskId: nextTask.id,
          description: nextTask.description,
          whiteboard,
        });
      } else if (isSessionFullyComplete(sessionId)) {
        // All tasks done — emit tasks_done, start idle timer
        const room = `session:${sessionId}`;
        io.to(room).emit("session:tasks_done", { sessionId });
        console.log(
          `[server] Session ${sessionId} — all tasks completed, agents idling`
        );

        // Start 5-min idle timer (agents stay alive for follow-ups)
        startIdleTimer(sessionId);
      }
      // Otherwise: no pending tasks but session not complete — agent idles
    });

    socket.on("whiteboard:updated", (data: WhiteboardUpdatedEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      // Append to whiteboard (agents append, not overwrite)
      const current = getWhiteboard(sessionId);
      const updated = current + data.content;
      updateWhiteboard(sessionId, updated);

      io.to(`session:${sessionId}`).emit("whiteboard:updated", {
        sessionId,
        content: updated,
      });
    });

    socket.on("replay:complete", async (data: ReplayCompleteEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      const { agentId, manifestUrl, frameCount } = data;
      console.log(
        `[server] Session ${sessionId} — replay uploaded for agent ${agentId} (${frameCount} frames)`
      );

      // Persist to database
      persistReplay(sessionId, agentId, manifestUrl, frameCount).catch(
        console.error
      );

      // Broadcast to browser clients
      io.to(`session:${sessionId}`).emit("replay:ready", {
        agentId,
        manifestUrl,
        frameCount,
      });
    });

    socket.on("agent:terminated", (data: AgentTerminatedEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      updateAgentStatus(sessionId, data.agentId, "terminated");
      io.to(`session:${sessionId}`).emit("agent:terminated", {
        agentId: data.agentId,
      });

      // Don't trigger completion from agent termination — agents now stay alive.
      // Session completion is handled by the idle timer.
    });

    socket.on("disconnect", () => {
      console.log(`[socket.io] Client disconnected: ${socket.id}`);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});

/**
 * Find the session ID from socket rooms.
 * Workers join rooms named "session:{id}".
 */
function findSessionId(socket: { rooms: Set<string> }): string | null {
  for (const room of socket.rooms) {
    if (room.startsWith("session:")) {
      return room.slice("session:".length);
    }
  }
  return null;
}

function isSessionFullyComplete(sessionId: string): boolean {
  const session = getSession(sessionId);
  if (!session) return true;
  return session.todos.length > 0 && session.todos.every((t) => t.status === "completed");
}
