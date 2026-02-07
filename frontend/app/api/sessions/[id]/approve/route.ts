import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  getSession,
  approveSession,
  updateTodos,
} from "@/lib/session-store";
import { getIO } from "@/lib/socket";
import { spawnWorkers } from "@/lib/worker-manager";
import type { Todo } from "@/lib/types";
import { auth } from "@/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.userId && session.userId !== authSession.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Session is not pending approval" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { tasks, agentCount } = body as {
    tasks: { id: string; description: string }[];
    agentCount: number;
  };

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return NextResponse.json(
      { error: "At least one task is required" },
      { status: 400 }
    );
  }

  if (!agentCount || agentCount < 1 || agentCount > 4) {
    return NextResponse.json(
      { error: "agentCount must be between 1 and 4" },
      { status: 400 }
    );
  }

  // Update tasks — assign new IDs for any tasks added by the user
  const updatedTodos: Todo[] = tasks.map((t) => ({
    id: t.id.startsWith("new-") ? uuidv4() : t.id,
    description: t.description,
    status: "pending" as const,
    assignedTo: null,
  }));

  updateTodos(sessionId, updatedTodos);
  session.agentCount = agentCount;

  // Approve: sets status to "running"
  approveSession(sessionId);

  // Emit task:created events
  try {
    const io = getIO();
    for (const todo of updatedTodos) {
      io.to(`session:${sessionId}`).emit("task:created", todo);
    }
  } catch {
    console.warn("[approve] Socket.io not available, skipping emit");
  }

  // Spawn worker processes
  spawnWorkers(sessionId, agentCount);

  return NextResponse.json({ status: "running" });
}
