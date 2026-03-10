// Typed config layer with env/$VAR resolution (§6)

import type {
  ServiceConfig,
  TrackerConfig,
  PollingConfig,
  WorkspaceConfig,
  HooksConfig,
  AgentConfig,
  CodexConfig,
  ServerConfig,
  WorkflowConfig,
} from "../types.js";
import { DEFAULTS } from "./defaults.js";
import { resolveEnvVars, resolvePath } from "../util/env.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("config");

function getString(fm: Record<string, unknown>, path: string, fallback?: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = fm;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === "string") {
    try {
      return resolveEnvVars(current);
    } catch {
      return current;
    }
  }
  return fallback;
}

function getNumber(fm: Record<string, unknown>, path: string, fallback: number): number {
  const parts = path.split(".");
  let current: unknown = fm;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "number" ? current : fallback;
}

function getStringArray(fm: Record<string, unknown>, path: string, fallback: string[]): string[] {
  const parts = path.split(".");
  let current: unknown = fm;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return fallback;
    current = (current as Record<string, unknown>)[part];
  }
  if (Array.isArray(current) && current.every((v) => typeof v === "string")) {
    return current as string[];
  }
  return fallback;
}

function getRecord(fm: Record<string, unknown>, path: string): Record<string, number> | undefined {
  const parts = path.split(".");
  let current: unknown = fm;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === "object" && current !== null && !Array.isArray(current)) {
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
      if (typeof v === "number") result[k] = v;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return undefined;
}

/**
 * Build a typed ServiceConfig from workflow front matter.
 */
export function buildConfig(workflow: WorkflowConfig, cliOverrides?: { port?: number }): ServiceConfig {
  const fm = workflow.front_matter;

  const tracker: TrackerConfig = {
    kind: (getString(fm, "tracker.kind", DEFAULTS.tracker.kind) as "linear") ?? "linear",
    api_key: getString(fm, "tracker.api_key") ?? "",
    project_slug: getString(fm, "tracker.project_slug") ?? "",
    endpoint: getString(fm, "tracker.endpoint", DEFAULTS.tracker.endpoint),
    active_states: getStringArray(fm, "tracker.active_states", [...DEFAULTS.tracker.active_states]),
    terminal_states: getStringArray(fm, "tracker.terminal_states", [...DEFAULTS.tracker.terminal_states]),
    todo_state: getString(fm, "tracker.todo_state", DEFAULTS.tracker.todo_state),
  };

  const polling: PollingConfig = {
    interval_ms: getNumber(fm, "polling.interval_ms", DEFAULTS.polling.interval_ms),
  };

  const workspace: WorkspaceConfig = {
    root: resolvePath(getString(fm, "workspace.root", DEFAULTS.workspace.root) ?? DEFAULTS.workspace.root),
  };

  const hooks: HooksConfig = {
    timeout_ms: getNumber(fm, "hooks.timeout_ms", DEFAULTS.hooks.timeout_ms),
    after_create: getString(fm, "hooks.after_create"),
    before_run: getString(fm, "hooks.before_run"),
    after_run: getString(fm, "hooks.after_run"),
    before_remove: getString(fm, "hooks.before_remove"),
  };

  const agent: AgentConfig = {
    max_concurrent_agents: getNumber(fm, "agent.max_concurrent_agents", DEFAULTS.agent.max_concurrent_agents),
    max_concurrent_agents_by_state: getRecord(fm, "agent.max_concurrent_agents_by_state"),
    max_turns: getNumber(fm, "agent.max_turns", DEFAULTS.agent.max_turns),
    max_retries: getNumber(fm, "agent.max_retries", DEFAULTS.agent.max_retries),
    max_retry_backoff_ms: getNumber(fm, "agent.max_retry_backoff_ms", DEFAULTS.agent.max_retry_backoff_ms),
    continuation_retry_delay_ms: getNumber(fm, "agent.continuation_retry_delay_ms", DEFAULTS.agent.continuation_retry_delay_ms),
  };

  const codex: CodexConfig = {
    command: getString(fm, "codex.command", DEFAULTS.codex.command) ?? DEFAULTS.codex.command,
    model: getString(fm, "codex.model"),
    turn_timeout_ms: getNumber(fm, "codex.turn_timeout_ms", DEFAULTS.codex.turn_timeout_ms),
    stall_timeout_ms: getNumber(fm, "codex.stall_timeout_ms", DEFAULTS.codex.stall_timeout_ms),
  };

  let server: ServerConfig | undefined;
  const configPort = getNumber(fm, "server.port", 0);
  const effectivePort = cliOverrides?.port ?? (configPort > 0 ? configPort : undefined);
  if (effectivePort) {
    server = { port: effectivePort };
  }

  return { tracker, polling, workspace, hooks, agent, codex, server };
}

/**
 * Preflight validation (§6.3): ensure critical config is present.
 */
export function validateConfig(config: ServiceConfig): string[] {
  const errors: string[] = [];

  if (!config.tracker.kind) {
    errors.push("tracker.kind is required");
  }
  if (!config.tracker.api_key) {
    errors.push("tracker.api_key is required (set LINEAR_API_KEY env var or tracker.api_key in workflow)");
  }
  if (!config.tracker.project_slug) {
    errors.push("tracker.project_slug is required");
  }
  if (!config.codex.command) {
    errors.push("codex.command must be non-empty");
  }
  if (config.tracker.active_states.length === 0) {
    errors.push("tracker.active_states must have at least one state");
  }
  if (config.tracker.terminal_states.length === 0) {
    errors.push("tracker.terminal_states must have at least one state");
  }

  return errors;
}

/**
 * Update config in-place from a new workflow (§6.2 dynamic reload).
 */
export function reloadConfig(
  current: ServiceConfig,
  workflow: WorkflowConfig,
  cliOverrides?: { port?: number },
): ServiceConfig {
  const newConfig = buildConfig(workflow, cliOverrides);
  log.info("Config reloaded from workflow file");
  return newConfig;
}
