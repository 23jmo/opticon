import Dedalus from "dedalus-labs";

const client = new Dedalus();

/**
 * Decompose a prompt into independent, parallelizable task descriptions
 * using Claude Sonnet via the Dedalus Labs API.
 */
export async function decomposeTasks(
  prompt: string,
  agentCount: number
): Promise<string[]> {
  const response = await client.chat.completions.create({
    model: "anthropic/claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a JSON API that decomposes user requests into parallelizable tasks. You respond with raw JSON only, never natural language.`,
      },
      {
        role: "user",
        content: `Decompose the following request into exactly ${agentCount} independent tasks that AI agents can execute on separate cloud desktops with browsers and terminals.

Request: ${prompt.trim()}

Return a JSON object with a "todos" array where each item has a "description" field containing a specific, actionable task. Keep each description to 2-3 sentences max.`,
      },
    ],
  });

  let text = response.choices[0].message.content || "";
  console.log("[orchestrator] Sonnet response:", text.substring(0, 300));

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  const parsed = JSON.parse(text);
  if (!parsed.todos || !Array.isArray(parsed.todos)) {
    throw new Error("Response missing 'todos' array");
  }
  return parsed.todos.map((t: { description: string }) => t.description);
}
