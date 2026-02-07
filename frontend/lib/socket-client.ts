import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    socket = io(apiUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function createSessionSocket(sessionId: string): Socket {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const sessionSocket = io(apiUrl, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  // Join session room on connect
  sessionSocket.on("connect", () => {
    sessionSocket.emit("join-session", sessionId);
  });

  return sessionSocket;
}
