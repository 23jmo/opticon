// The Heart — Poll loop, dispatch, concurrency, state machine (§7-8)

import type {
  OrchestratorState,
  RunningEntry,
  RunAttempt,
  Issue,
  ServiceConfig,
  RuntimeEvent,
  LiveSession,
} from "../types.js";
import { LinearClient } from "../tracker/linear-client.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import { RetryQueue } from "./retry-queue.js";
import { reconcileRunningIssues } from "./reconciler.js";
import { sortCandidates, filterEligible } from "../tracker/normalize.js";
import { runAgent } from "../agent/agent-runner.js";
import { createLinearGraphqlTool } from "../agent/linear-graphql-tool.js";
import { validateConfig } from "../config/config.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("orchestrator");

export class Orchestrator {
  private config: ServiceConfig;
  private tracker: LinearClient;
  private workspaceManager: WorkspaceManager;
  private retryQueue: RetryQueue;
  private pollTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private promptTemplate: string;

  // Recent events ring buffer for dashboard
  private recentEvents: RuntimeEvent[] = [];
  private maxRecentEvents = 100;

  readonly state: OrchestratorState;

  constructor(
    config: ServiceConfig,
    tracker: LinearClient,
    workspaceManager: WorkspaceManager,
    promptTemplate: string,
  ) {
    this.config = config;
    this.tracker = tracker;
    this.workspaceManager = workspaceManager;
    this.retryQueue = new RetryQueue();
    this.promptTemplate = promptTemplate;

    this.state = {
      poll_interval_ms: config.polling.interval_ms,
      max_concurrent_agents: config.agent.max_concurrent_agents,
      running: new Map(),
      claimed: new Set(),
      retry_attempts: new Map(),
      completed: new Set(),
      codex_totals: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        seconds_running: 0,
      },
      codex_rate_limits: null,
    };
  }

  /**
   * Startup cleanup (§8.6): Remove workspaces for terminal issues.
   */
  async startupCleanup(): Promise<void> {
    log.info("Running startup terminal cleanup");
    try {
      const terminalIssues = await this.tracker.fetchIssuesByStates(this.config.tracker.terminal_states);
      for (const issue of terminalIssues) {
        await this.workspaceManager.remove(issue.identifier);
      }
      if (terminalIssues.length > 0) {
        log.info(`Cleaned up ${terminalIssues.length} terminal issue workspaces`);
      }
    } catch (err) {
      log.warn(`Startup cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Start the poll loop.
   */
  start(): void {
    log.info("Starting orchestrator");
    this.stopping = false;

    // Immediate first tick
    this.tick().catch((err) => {
      log.error(`Initial tick failed: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Schedule recurring poll
    this.pollTimer = setInterval(() => {
      this.tick().catch((err) => {
        log.error(`Poll tick failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, this.config.polling.interval_ms);
  }

  /**
   * Stop the orchestrator, cancel all agents.
   */
  async stop(): Promise<void> {
    log.info("Stopping orchestrator");
    this.stopping = true;

    // Stop poll timer
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Cancel all retries
    this.retryQueue.cancelAll();

    // Abort all running agents
    for (const [, entry] of this.state.running) {
      entry.abort_controller.abort();
    }

    // Wait for running agents to finish (max 10s)
    const timeout = Date.now() + 10_000;
    while (this.state.running.size > 0 && Date.now() < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (this.state.running.size > 0) {
      log.warn(`${this.state.running.size} agents still running after stop timeout`);
    }

    log.info("Orchestrator stopped");
  }

  /**
   * Trigger an immediate poll+reconciliation (for POST /refresh).
   */
  async refresh(): Promise<void> {
    await this.tick();
  }

  /**
   * Single poll tick (§8.1, §16.2).
   */
  async tick(): Promise<void> {
    if (this.stopping) return;

    // Step 1: Reconcile running issues
    await this.reconcile();

    // Step 2: Validate dispatch config
    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      log.warn(`Config validation failed, skipping dispatch: ${errors.join("; ")}`);
      return;
    }

    // Step 3: Fetch and sort candidates
    let candidates: Issue[];
    try {
      candidates = await this.tracker.fetchCandidateIssues();
    } catch (err) {
      log.error(`Failed to fetch candidates: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Filter eligible
    const runningIds = new Set(
      Array.from(this.state.running.keys()),
    );
    const eligible = filterEligible(
      candidates,
      this.config.tracker.active_states,
      this.config.tracker.terminal_states,
      runningIds,
      this.state.claimed,
    );

    // Also exclude issues in retry queue or completed
    const dispatchable = eligible.filter(
      (issue) => !this.retryQueue.has(issue.id) && !this.state.completed.has(issue.id),
    );

    // Sort by priority
    const sorted = sortCandidates(dispatchable);

    // Step 4: Dispatch while slots available (§8.3)
    const availableSlots = this.getAvailableSlots();
    let dispatched = 0;

    for (const issue of sorted) {
      if (dispatched >= availableSlots) break;
      if (this.stopping) break;

      // Check per-state limits
      if (!this.checkPerStateLimit(issue.state)) continue;

      // Dispatch
      this.dispatch(issue, null);
      dispatched++;
    }

    if (dispatched > 0) {
      log.info(`Dispatched ${dispatched} issues (${this.state.running.size} running)`);
    }
  }

  /**
   * Get available concurrency slots (§8.3).
   */
  private getAvailableSlots(): number {
    return Math.max(this.config.agent.max_concurrent_agents - this.state.running.size, 0);
  }

  /**
   * Check per-state concurrency limit (§8.3).
   */
  private checkPerStateLimit(issueState: string): boolean {
    const byState = this.config.agent.max_concurrent_agents_by_state;
    if (!byState || !(issueState in byState)) return true;

    const limit = byState[issueState];
    const runningInState = Array.from(this.state.running.values()).filter(
      (e) => e.issue.state === issueState,
    ).length;

    return runningInState < limit;
  }

  /**
   * Dispatch an issue — claim, create workspace, run agent.
   */
  private dispatch(issue: Issue, previousAttempt: number | null): void {
    const attempt = previousAttempt !== null ? previousAttempt + 1 : null;

    // Claim
    this.state.claimed.add(issue.id);

    // Run async without blocking
    this.runIssue(issue, attempt).catch((err) => {
      log.error(`Issue ${issue.identifier} run failed: ${err instanceof Error ? err.message : String(err)}`, {
        identifier: issue.identifier,
      });
      this.state.running.delete(issue.id);
      this.state.claimed.delete(issue.id);
    });
  }

  /**
   * Full run lifecycle for a single issue.
   */
  private async runIssue(issue: Issue, attempt: number | null): Promise<void> {
    const issueLog = log.child({ identifier: issue.identifier });
    const abortController = new AbortController();

    // Create workspace
    let workspacePath: string;
    try {
      const ws = await this.workspaceManager.create(issue.identifier);
      workspacePath = ws.path;
    } catch (err) {
      issueLog.error(`Workspace creation failed: ${err instanceof Error ? err.message : String(err)}`);
      this.state.claimed.delete(issue.id);
      return;
    }

    // Run before_run hook
    try {
      await this.workspaceManager.runBeforeRun(workspacePath);
    } catch (err) {
      issueLog.error(`before_run hook failed, aborting: ${err instanceof Error ? err.message : String(err)}`);
      this.state.claimed.delete(issue.id);
      return;
    }

    // Create run attempt record
    const runAttempt: RunAttempt = {
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      attempt,
      workspace_path: workspacePath,
      started_at: new Date().toISOString(),
      status: "running",
    };

    // Register as running
    const runningEntry: RunningEntry = {
      issue,
      run_attempt: runAttempt,
      session: null,
      abort_controller: abortController,
      started_at_ms: Date.now(),
    };
    this.state.running.set(issue.id, runningEntry);
    this.state.claimed.delete(issue.id);

    issueLog.info("Running agent");

    // Build MCP tools
    const mcpTools = [createLinearGraphqlTool(this.tracker)];

    // Run agent
    const result = await runAgent(
      issue,
      attempt,
      workspacePath,
      {
        agent: this.config.agent,
        codex: this.config.codex,
        promptTemplate: this.promptTemplate,
        mcpTools,
      },
      abortController,
      (event) => this.addEvent(event),
      (session) => {
        runningEntry.session = session;
        // Update token totals
        this.state.codex_totals.input_tokens +=
          session.codex_input_tokens - session.last_reported_input_tokens;
        this.state.codex_totals.output_tokens +=
          session.codex_output_tokens - session.last_reported_output_tokens;
        this.state.codex_totals.total_tokens =
          this.state.codex_totals.input_tokens + this.state.codex_totals.output_tokens;
        session.last_reported_input_tokens = session.codex_input_tokens;
        session.last_reported_output_tokens = session.codex_output_tokens;
        session.last_reported_total_tokens = session.codex_total_tokens;
      },
    );

    // Remove from running
    this.state.running.delete(issue.id);

    // Update run duration
    const durationSec = (Date.now() - runningEntry.started_at_ms) / 1000;
    this.state.codex_totals.seconds_running += durationSec;

    // Run after_run hook (best effort)
    await this.workspaceManager.runAfterRun(workspacePath);

    // Handle result
    runAttempt.status = result.status;
    runAttempt.error = result.error;

    if (result.status === "completed") {
      issueLog.info("Agent completed successfully");
      // Continuation retry — re-check if issue is still active
      const attemptNum = attempt ?? 0;
      if (attemptNum < this.config.agent.max_retries) {
        const delay = RetryQueue.calculateBackoff(
          attemptNum + 1,
          true,
          this.config.agent.continuation_retry_delay_ms,
          this.config.agent.max_retry_backoff_ms,
        );
        this.retryQueue.enqueue(issue.id, issue.identifier, attemptNum + 1, delay, null, (id) => {
          this.handleRetryFire(id);
        });
      } else {
        this.state.completed.add(issue.id);
      }
    } else if (result.status === "failed") {
      const attemptNum = attempt ?? 0;
      if (attemptNum < this.config.agent.max_retries) {
        const delay = RetryQueue.calculateBackoff(
          attemptNum + 1,
          false,
          this.config.agent.continuation_retry_delay_ms,
          this.config.agent.max_retry_backoff_ms,
        );
        issueLog.info(`Scheduling retry in ${delay}ms (attempt ${attemptNum + 1})`);
        this.retryQueue.enqueue(
          issue.id,
          issue.identifier,
          attemptNum + 1,
          delay,
          result.error ?? null,
          (id) => {
            this.handleRetryFire(id);
          },
        );
      } else {
        issueLog.warn(`Max retries reached for ${issue.identifier}`);
        this.state.completed.add(issue.id);
      }
    } else if (result.status === "killed") {
      issueLog.info("Agent was killed");
      // Don't retry killed agents — they were explicitly stopped
    }
  }

  /**
   * Handle retry timer firing (§8.4).
   */
  private handleRetryFire(issueId: string): void {
    // Re-fetch candidates to find the issue
    this.tracker
      .fetchCandidateIssues()
      .then((candidates) => {
        const issue = candidates.find((c) => c.id === issueId);
        if (!issue) {
          log.info(`Retry: issue ${issueId} no longer a candidate`);
          return;
        }

        // Check slots
        if (this.getAvailableSlots() <= 0) {
          // Re-queue with short delay
          const entry = this.state.retry_attempts.get(issueId);
          const attempt = entry?.attempt ?? 1;
          log.info(`Retry: no slots available, re-queuing ${issue.identifier}`);
          this.retryQueue.enqueue(issueId, issue.identifier, attempt, 5_000, null, (id) => {
            this.handleRetryFire(id);
          });
          return;
        }

        // Dispatch
        const entry = this.state.retry_attempts.get(issueId);
        this.dispatch(issue, entry?.attempt ?? 0);
      })
      .catch((err) => {
        log.error(`Retry fire failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /**
   * Run reconciliation (§8.5).
   */
  private async reconcile(): Promise<void> {
    if (this.state.running.size === 0) return;

    const result = await reconcileRunningIssues(
      this.state,
      this.tracker,
      this.workspaceManager,
      this.config.codex.stall_timeout_ms,
      this.config.tracker.terminal_states,
      this.config.tracker.active_states,
    );

    // Clean up workspaces for terminal issues
    for (const issueId of result.terminal) {
      const entry = this.state.running.get(issueId);
      if (entry) {
        await this.workspaceManager.remove(entry.issue.identifier);
        this.state.running.delete(issueId);
      }
    }
  }

  private addEvent(event: RuntimeEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }
  }

  getRecentEvents(): RuntimeEvent[] {
    return [...this.recentEvents];
  }

  getRetryQueue(): RetryQueue {
    return this.retryQueue;
  }

  /**
   * Update config on workflow reload (§6.2).
   */
  updateConfig(config: ServiceConfig, promptTemplate: string): void {
    this.config = config;
    this.promptTemplate = promptTemplate;
    this.state.poll_interval_ms = config.polling.interval_ms;
    this.state.max_concurrent_agents = config.agent.max_concurrent_agents;

    // Restart poll timer with new interval
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => {
        this.tick().catch((err) => {
          log.error(`Poll tick failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, config.polling.interval_ms);
    }

    this.tracker.updateConfig(config.tracker);
    this.workspaceManager.updateConfig(config.workspace, config.hooks);
  }
}
