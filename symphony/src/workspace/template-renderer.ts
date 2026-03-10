// Liquid prompt template rendering (§12)

import { Liquid } from "liquidjs";
import type { Issue } from "../types.js";

const DEFAULT_PROMPT = "You are working on an issue from Linear.";

const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
});

export interface TemplateContext {
  issue: Issue;
  attempt: number | null;
}

/**
 * Render a prompt template with issue context (§12).
 * Empty template body falls back to default prompt (§5.4).
 */
export async function renderPrompt(
  template: string,
  context: TemplateContext,
): Promise<string> {
  const body = template.trim();
  if (!body) {
    return DEFAULT_PROMPT;
  }

  return engine.parseAndRender(body, {
    issue: context.issue,
    attempt: context.attempt,
  });
}

/**
 * Build a continuation/guidance prompt for subsequent turns.
 */
export function buildContinuationPrompt(issue: Issue, turnCount: number): string {
  return `Continue working on issue ${issue.identifier}: "${issue.title}". This is turn ${turnCount + 1}. Review what you've done so far and continue making progress.`;
}
