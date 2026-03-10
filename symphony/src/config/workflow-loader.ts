// Workflow file parser and watcher (§5)

import { readFileSync, existsSync } from "node:fs";
import { watch } from "chokidar";
import matter from "gray-matter";
import type { WorkflowConfig } from "../types.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("workflow-loader");

export class WorkflowParseError extends Error {
  constructor(
    message: string,
    public code: "missing_workflow_file" | "workflow_parse_error" | "workflow_front_matter_not_a_map",
  ) {
    super(message);
    this.name = "WorkflowParseError";
  }
}

/**
 * Parse a WORKFLOW.md file into structured config.
 * §5: detect `---` fences, extract YAML front matter, trim markdown body.
 */
export function parseWorkflowFile(filePath: string): WorkflowConfig {
  if (!existsSync(filePath)) {
    throw new WorkflowParseError(
      `Workflow file not found: ${filePath}`,
      "missing_workflow_file",
    );
  }

  const raw = readFileSync(filePath, "utf-8");

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    throw new WorkflowParseError(
      `Failed to parse workflow file: ${err instanceof Error ? err.message : String(err)}`,
      "workflow_parse_error",
    );
  }

  const frontMatter = parsed.data;

  if (typeof frontMatter !== "object" || frontMatter === null || Array.isArray(frontMatter)) {
    throw new WorkflowParseError(
      "Workflow front matter must be a YAML map",
      "workflow_front_matter_not_a_map",
    );
  }

  return {
    front_matter: frontMatter as Record<string, unknown>,
    prompt_template: parsed.content.trim(),
    file_path: filePath,
  };
}

/**
 * Watch a workflow file for changes. On valid reload, calls onUpdate.
 * On invalid reload, keeps last-known-good config (§6.2).
 */
export function watchWorkflowFile(
  filePath: string,
  onUpdate: (config: WorkflowConfig) => void,
): { close: () => Promise<void> } {
  let debounceTimer: NodeJS.Timeout | null = null;

  const watcher = watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  watcher.on("change", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const updated = parseWorkflowFile(filePath);
        log.info("Workflow file reloaded successfully");
        onUpdate(updated);
      } catch (err) {
        log.warn(
          `Workflow file reload failed, keeping last-known-good config: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, 300);
  });

  return {
    close: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      await watcher.close();
    },
  };
}
