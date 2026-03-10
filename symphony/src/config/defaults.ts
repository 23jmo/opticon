// Default config values (§6.4)

import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULTS = {
  tracker: {
    kind: "linear" as const,
    endpoint: "https://api.linear.app/graphql",
    active_states: ["In Progress", "Todo"],
    terminal_states: ["Done", "Canceled", "Cancelled"],
    todo_state: "Todo",
  },

  polling: {
    interval_ms: 30_000,
  },

  workspace: {
    root: join(tmpdir(), "symphony_workspaces"),
  },

  hooks: {
    timeout_ms: 60_000,
  },

  agent: {
    max_concurrent_agents: 10,
    max_turns: 5,
    max_retries: 3,
    max_retry_backoff_ms: 320_000,
    continuation_retry_delay_ms: 1_000,
  },

  codex: {
    command: "claude",
    turn_timeout_ms: 3_600_000,   // 1 hour
    stall_timeout_ms: 600_000,    // 10 minutes
  },
} as const;
