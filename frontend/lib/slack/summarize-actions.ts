/**
 * LLM-powered action summarizer for Slack milestone updates.
 *
 * Buffers recent tool actions and uses Haiku to produce a single
 * intent-level sentence (e.g. "Installing project dependencies")
 * instead of raw tool names like "Tool: click".
 */

import Dedalus from "dedalus-labs";

const client = new Dedalus();

export interface BufferedAction {
  tool: string;
  args?: Record<string, unknown>;
  reasoning?: string;
}

/**
 * Summarize a batch of recent agent actions into a single natural-language
 * sentence using a fast/cheap LLM (Haiku).
 *
 * Returns a short intent description like "Navigating to the settings page".
 * Falls back to "Working..." if the LLM call fails.
 */
export async function summarizeActions(
  actions: BufferedAction[],
): Promise<string> {
  if (actions.length === 0) return "Working...";

  const lines = actions.map((a) => {
    if (a.reasoning) return a.reasoning;
    const argsStr = a.args ? JSON.stringify(a.args) : "";
    return `${a.tool}(${argsStr})`;
  });

  try {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content:
            "Summarize what an AI agent is doing on a computer desktop in ONE short sentence (under 15 words). Be specific and describe the intent, not the individual actions. Examples: \"Installing project dependencies\", \"Filling out the login form\", \"Navigating to the settings page\". Respond with the sentence only, no quotes.",
        },
        {
          role: "user",
          content: `Recent actions:\n${lines.join("\n")}`,
        },
      ],
    });

    return response.choices[0].message.content?.trim() || "Working...";
  } catch (err) {
    console.error("[summarize-actions] Haiku call failed:", err);
    return "Working...";
  }
}
