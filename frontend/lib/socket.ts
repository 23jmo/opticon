import type { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "./types";

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

const globalSocket = globalThis as unknown as {
  __opticon_io?: TypedServer;
};

export function setIO(server: TypedServer): void {
  globalSocket.__opticon_io = server;
}

export function getIO(): TypedServer {
  if (!globalSocket.__opticon_io) throw new Error("Socket.io not initialized");
  return globalSocket.__opticon_io;
}
