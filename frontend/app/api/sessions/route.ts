import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import {
  createSession,
  addTodos,
  getSession,
} from "@/lib/session-store";
import { getIO } from "@/lib/socket";
import { spawnWorkers } from "@/lib/worker-manager";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  const body = await request.json();
  const { prompt, agentCount } = body as {
    prompt: string;
    agentCount: number;
  };

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  if (
    !agentCount ||
    typeof agentCount !== "number" ||
    agentCount < 1 ||
    agentCount > 4
  ) {
    return NextResponse.json(
      { error: "agentCount must be between 1 and 4" },
      { status: 400 }
    );
  }

  const sessionId = uuidv4();
  createSession(sessionId, prompt.trim(), agentCount);

  // Decompose prompt into TODOs via Claude
  let todoDescriptions: string[];
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1024,
      system: `You are a task decomposition engine. Given a user's prompt, break it down into independent, parallelizable tasks that can each be executed by an AI agent controlling a cloud desktop (browser, file system, etc).

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Target exactly ${agentCount} tasks (one per available agent)
- Be specific and actionable in each task description`,
      messages: [{ role: "user", content: prompt.trim() }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    const parsed = JSON.parse(textBlock.text);
    todoDescriptions = parsed.todos.map(
      (t: { description: string }) => t.description
    );
  } catch (error) {
    console.error("[orchestrator] Failed to decompose prompt:", error);
    const session = getSession(sessionId);
    if (session) session.status = "failed";
    return NextResponse.json(
      { error: "Failed to decompose prompt" },
      { status: 500 }
    );
  }

  // Add TODOs to session and emit events
  const todos = addTodos(sessionId, todoDescriptions);

  try {
    const io = getIO();
    for (const todo of todos) {
      io.to(`session:${sessionId}`).emit("task:created", todo);
    }
  } catch {
    // Socket.io may not be initialized in test environments
    console.warn("[orchestrator] Socket.io not available, skipping emit");
  }

  // Spawn worker processes
  spawnWorkers(sessionId, agentCount);

  return NextResponse.json({ sessionId }, { status: 201 });
}
