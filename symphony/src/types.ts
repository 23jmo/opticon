// Symphony Domain Model — Spec §4

// §4.1.1 Issue
export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branch_name: string | null;
  url: string | null;
  labels: string[];
  blocked_by: BlockerRef[];
  created_at: string | null;
  updated_at: string | null;
}

export interface BlockerRef {
  id: string;
  identifier: string;
  state: string;
}

// §4.1.2 Tracker Config
export interface TrackerConfig {
  kind: "linear";
  api_key: string;
  project_slug: string;
  endpoint?: string;
  active_states: string[];
  terminal_states: string[];
  todo_state?: string;
}

// §4.1.3 Polling Config
export interface PollingConfig {
  interval_ms: number;
}

// §4.1.4 Workspace Config
export interface WorkspaceConfig {
  root: string;
}

// §4.1.4 Hooks Config
export interface HooksConfig {
  timeout_ms: number;
  after_create?: string;
  before_run?: string;
  after_run?: string;
  before_remove?: string;
}

// §4.1.4 Agent Config
export interface AgentConfig {
  max_concurrent_agents: number;
  max_concurrent_agents_by_state?: Record<string, number>;
  max_turns: number;
  max_retries: number;
  max_retry_backoff_ms: number;
  continuation_retry_delay_ms: number;
}

// §4.1.4 Codex Config (mapped to Claude Code)
export interface CodexConfig {
  command: string;
  model?: string;
  turn_timeout_ms: number;
  stall_timeout_ms: number;
}

// §4.1.3 Service Config (full)
export interface ServiceConfig {
  tracker: TrackerConfig;
  polling: PollingConfig;
  workspace: WorkspaceConfig;
  hooks: HooksConfig;
  agent: AgentConfig;
  codex: CodexConfig;
  server?: ServerConfig;
}

export interface ServerConfig {
  port: number;
}

// §4.1.5 Run Attempt
export type RunStatus = "running" | "completed" | "failed" | "retry_queued" | "killed";

export interface RunAttempt {
  issue_id: string;
  issue_identifier: string;
  attempt: number | null;
  workspace_path: string;
  started_at: string;
  status: RunStatus;
  error?: string;
}

// §4.1.6 Live Session
export interface LiveSession {
  session_id: string;
  thread_id: string;
  turn_id: string;
  codex_app_server_pid: string | null;
  last_codex_event: string | null;
  last_codex_timestamp: string | null;
  last_codex_message: string;
  turn_count: number;
  codex_input_tokens: number;
  codex_output_tokens: number;
  codex_total_tokens: number;
  last_reported_input_tokens: number;
  last_reported_output_tokens: number;
  last_reported_total_tokens: number;
}

// §4.1.7 Retry Entry
export interface RetryEntry {
  issue_id: string;
  identifier: string;
  attempt: number;
  due_at_ms: number;
  timer_handle: NodeJS.Timeout;
  error: string | null;
}

// §4.1.8 Running Entry
export interface RunningEntry {
  issue: Issue;
  run_attempt: RunAttempt;
  session: LiveSession | null;
  abort_controller: AbortController;
  started_at_ms: number;
}

// §4.1.8 Orchestrator Runtime State
export interface OrchestratorState {
  poll_interval_ms: number;
  max_concurrent_agents: number;
  running: Map<string, RunningEntry>;
  claimed: Set<string>;
  retry_attempts: Map<string, RetryEntry>;
  completed: Set<string>;
  codex_totals: TokenTotals;
  codex_rate_limits: unknown | null;
}

export interface TokenTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  seconds_running: number;
}

// §5 Workflow
export interface WorkflowConfig {
  front_matter: Record<string, unknown>;
  prompt_template: string;
  file_path: string;
}

// Runtime events emitted by agent
export type RuntimeEventType =
  | "agent:start"
  | "agent:turn_start"
  | "agent:turn_complete"
  | "agent:message"
  | "agent:tool_use"
  | "agent:error"
  | "agent:stop";

export interface RuntimeEvent {
  type: RuntimeEventType;
  issue_id: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// §4.2 Workspace key sanitization
export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}
