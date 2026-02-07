import Dedalus from "dedalus-labs";
import { DedalusRunner } from "dedalus-labs";

let runner: DedalusRunner | null = null;

function getRunner(): DedalusRunner {
  if (!runner) {
    const client = new Dedalus({ apiKey: process.env.DEDALUS_API_KEY });
    runner = new DedalusRunner(client);
  }
  return runner;
}

/**
 * Decompose a prompt into independent, parallelizable task descriptions
 * using the Dedalus orchestrator.
 */
export async function decomposeTasks(
  prompt: string,
  agentCount: number
): Promise<string[]> {
  const response = await getRunner().run({
    input: prompt.trim(),
    model: "anthropic/claude-sonnet-4-5-20250929",
    instructions: `You are a task decomposition engine. Given a user's prompt, break it down into independent, parallelizable tasks that can each be executed by an AI agent controlling a cloud desktop (browser, file system, etc).

Rules:
- Each task must be independently executable
- Tasks should be roughly equal in complexity
- Return ONLY valid JSON: { "todos": [{ "description": "..." }] }
- Target exactly ${agentCount} tasks (one per available agent)
- Be specific and actionable in each task description`,
    max_tokens: 1024,
  });

  const raw = (response as { finalOutput: string }).finalOutput
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(raw);
  return parsed.todos.map((t: { description: string }) => t.description);
}
