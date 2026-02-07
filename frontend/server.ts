import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./lib/socket";
import type { ServerToClientEvents, ClientToServerEvents } from "./lib/types";

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

    socket.on("session:join", (sessionId) => {
      socket.join(`session:${sessionId}`);
      console.log(`[socket.io] ${socket.id} joined session:${sessionId}`);
    });

    socket.on("session:leave", (sessionId) => {
      socket.leave(`session:${sessionId}`);
      console.log(`[socket.io] ${socket.id} left session:${sessionId}`);
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
