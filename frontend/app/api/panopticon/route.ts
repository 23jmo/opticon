import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { persistSession, persistTodos } from "@/lib/db/session-persist";
import { getSessionStore } from "@/lib/session-store";
import { decomposeTasks } from "@/lib/orchestrator";
import type { Todo } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/panopticon - Create a new long-running Panopticon session
 */
export async function POST(request: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prompt, agentCount = 4, enablePersistence = true } = await request.json();

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const sessionId = `panopticon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userId = authSession.user.id;

    // Use Dedalus to decompose the prompt into tasks
    const taskList = await decomposeTasks(prompt, agentCount);

    // Convert to Todo format
    const todos: Todo[] = taskList.map((task, index) => ({
      id: `task-${sessionId}-${index + 1}`,
      description: task,
      status: "pending" as const,
      assignedTo: null,
      result: undefined,
    }));

    // Store in memory
    const store = getSessionStore();
    store.setSession(sessionId, {
      id: sessionId,
      userId,
      prompt,
      agentCount,
      status: "running",
      createdAt: Date.now(),
      todos,
      agents: [],
      whiteboard: "",
      isPanopticon: true, // Mark as Panopticon session
    });

    // Persist to database if enabled
    if (enablePersistence) {
      await persistSession(sessionId, userId, prompt, agentCount, "running");
      await persistTodos(sessionId, todos);
    }

    return NextResponse.json({
      sessionId,
      prompt,
      agentCount,
      todos,
      isPanopticon: true,
    });
  } catch (error) {
    console.error("[panopticon] Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create Panopticon session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/panopticon - List active Panopticon sessions for the user
 */
export async function GET() {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const store = getSessionStore();
    const userSessions = store.getUserSessions(authSession.user.id);

    // Filter for Panopticon sessions only
    const panopticonSessions = userSessions
      .filter(session => session.isPanopticon)
      .map(session => ({
        id: session.id,
        prompt: session.prompt,
        agentCount: session.agentCount,
        status: session.status,
        createdAt: session.createdAt,
        agents: session.agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          status: agent.status,
          tasksCompleted: agent.tasksCompleted || 0,
          streamUrl: agent.streamUrl,
        })),
        todos: session.todos,
        activeTasks: session.todos.filter(t => t.status === "assigned").length,
        completedTasks: session.todos.filter(t => t.status === "completed").length,
        totalTasks: session.todos.length,
      }));

    return NextResponse.json({ sessions: panopticonSessions });
  } catch (error) {
    console.error("[panopticon] Failed to fetch sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch Panopticon sessions" },
      { status: 500 }
    );
  }
}