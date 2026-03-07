"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type {
  ThumbnailUpdateEvent,
  DashboardSessionEvent,
} from "@/lib/types";

export function useDashboardSocket() {
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(
    new Map()
  );
  const [sessionUpdates, setSessionUpdates] = useState<
    Map<string, DashboardSessionEvent>
  >(new Map());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000");

    const socket = io(apiUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("dashboard:join");
    });

    socket.on("reconnect", () => {
      socket.emit("dashboard:join");
    });

    socket.on("thumbnail:update", (data: ThumbnailUpdateEvent) => {
      setThumbnails((prev) => {
        const next = new Map(prev);
        next.set(data.sessionId, data.thumbnail);
        return next;
      });
    });

    socket.on(
      "dashboard:session_updated",
      (data: DashboardSessionEvent) => {
        setSessionUpdates((prev) => {
          const next = new Map(prev);
          next.set(data.sessionId, data);
          return next;
        });
      }
    );

    return () => {
      socket.emit("dashboard:leave");
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { thumbnails, sessionUpdates };
}
