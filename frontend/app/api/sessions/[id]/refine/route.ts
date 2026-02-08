import { NextResponse } from "next/server";
import { getSession, updateTodos } from "@/lib/session-store";
import { auth } from "@/auth";
import { persistTodos } from "@/lib/db/session-persist";
import { refineTasksWithK2 } from "@/lib/k2-think";

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

  if (session.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Session is not pending approval" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { refinement, currentTasks } = body as {
    refinement: string;
    currentTasks: string[];
  };

  if (
    !refinement ||
    typeof refinement !== "string" ||
    refinement.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Refinement is required" },
      { status: 400 }
    );
  }

  // Use K2 Think to refine the task list
  let todoDescriptions: string[];
  try {
    todoDescriptions = await refineTasksWithK2(
      session.prompt,
      currentTasks,
      refinement.trim()
    );
  } catch (error) {
    console.error("[refine] Failed to refine tasks:", error);
    return NextResponse.json(
      { error: "Failed to refine tasks" },
      { status: 500 }
    );
  }

  // Update todos in session
  const todos = updateTodos(sessionId, todoDescriptions);

  // Persist updated todos to database
  persistTodos(sessionId, todos).catch(console.error);

  return NextResponse.json({ todos }, { status: 200 });
}
