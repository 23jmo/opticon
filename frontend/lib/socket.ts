import type { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: TypedServer | null = null;

export function setIO(server: TypedServer): void {
  io = server;
}

export function getIO(): TypedServer {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}
