import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO, getIO } from "./lib/socket";
import {
  getSession,
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
} from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

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
      } else {
        socket.emit("task:none");
      }
    });

    socket.on("agent:thinking", (data: AgentThinkingEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      io.to(`session:${sessionId}`).emit("agent:thinking", {
        agentId: data.agentId,
        action: data.action,
        timestamp: data.timestamp || new Date().toISOString(),
        isError: data.isError,
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
      } else {
        socket.emit("task:none");
      }
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

    socket.on("agent:terminated", (data: AgentTerminatedEvent) => {
      const sessionId = findSessionId(socket);
      if (!sessionId) return;

      updateAgentStatus(sessionId, data.agentId, "terminated");
      io.to(`session:${sessionId}`).emit("agent:terminated", {
        agentId: data.agentId,
      });

      checkSessionComplete(sessionId);
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
    console.log(`[server] Session ${sessionId} complete`);
  }
}
