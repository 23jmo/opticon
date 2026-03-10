// Claude Code Agent SDK wrapper (§10)
// Adapts Codex app-server concepts to Claude Agent SDK

import {
  query,
  createSdkMcpServer,
  type SDKResultMessage,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  Issue,
  LiveSession,
  RuntimeEvent,
  CodexConfig,
  AgentConfig,
} from "../types.js";
import { mapSdkMessage, extractTokenUsage } from "./event-mapper.js";
import { renderPrompt, buildContinuationPrompt, type TemplateContext } from "../workspace/template-renderer.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("agent-runner");

export interface AgentRunResult {
  status: "completed" | "failed" | "killed";
  error?: string;
  session: LiveSession;
  events: RuntimeEvent[];
}

export interface AgentRunnerConfig {
  agent: AgentConfig;
  codex: CodexConfig;
  promptTemplate: string;
  mcpTools?: SdkMcpToolDefinition<any>[];
}

/**
 * Run a Claude Code agent session for an issue.
 *
 * Worker attempt loop (§16.5 adapted):
 * 1. Render prompt from template
 * 2. Start Claude Code session via SDK query()
 * 3. First turn: full rendered prompt
 * 4. Loop up to max_turns
 * 5. Stream messages, forward events
 * 6. On turn complete, check if should continue
 */
export async function runAgent(
  issue: Issue,
  attempt: number | null,
  workspacePath: string,
  config: AgentRunnerConfig,
  abortController: AbortController,
  onEvent: (event: RuntimeEvent) => void,
  onSessionUpdate: (session: LiveSession) => void,
): Promise<AgentRunResult> {
  const events: RuntimeEvent[] = [];
  const issueLog = log.child({ identifier: issue.identifier, issue_id: issue.id });

  // Initialize session tracking
  const session: LiveSession = {
    session_id: "",
    thread_id: "",
    turn_id: "",
    codex_app_server_pid: null,
    last_codex_event: null,
    last_codex_timestamp: null,
    last_codex_message: "",
    turn_count: 0,
    codex_input_tokens: 0,
    codex_output_tokens: 0,
    codex_total_tokens: 0,
    last_reported_input_tokens: 0,
    last_reported_output_tokens: 0,
    last_reported_total_tokens: 0,
  };

  function emitEvent(event: RuntimeEvent): void {
    events.push(event);
    session.last_codex_event = event.type;
    session.last_codex_timestamp = event.timestamp;
    if (event.data?.message) {
      session.last_codex_message = String(event.data.message).slice(0, 500);
    }
    onEvent(event);
    onSessionUpdate(session);
  }

  // Build MCP server for custom tools if any
  let mcpServer: McpSdkServerConfigWithInstance | undefined;
  if (config.mcpTools && config.mcpTools.length > 0) {
    mcpServer = createSdkMcpServer({
      name: "symphony-tools",
      version: "1.0.0",
      tools: config.mcpTools,
    });
  }

  try {
    // Render prompt
    const templateContext: TemplateContext = { issue, attempt };
    const prompt = await renderPrompt(config.promptTemplate, templateContext);

    issueLog.info(`Starting agent session (attempt ${attempt ?? 1})`);

    let sessionId: string | undefined;
    let currentPrompt = prompt;

    // Turn loop
    for (let turn = 0; turn < config.agent.max_turns; turn++) {
      if (abortController.signal.aborted) {
        issueLog.info("Agent aborted");
        return { status: "killed", session, events };
      }

      session.turn_count = turn + 1;

      // Set up turn timeout
      const turnTimeout = setTimeout(() => {
        issueLog.warn(`Turn ${turn + 1} timed out after ${config.codex.turn_timeout_ms}ms`);
        abortController.abort();
      }, config.codex.turn_timeout_ms);

      try {
        issueLog.info(`Starting turn ${turn + 1}/${config.agent.max_turns}`);

        const queryResult = query({
          prompt: currentPrompt,
          options: {
            abortController,
            cwd: workspacePath,
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            ...(config.codex.model ? { model: config.codex.model } : {}),
            // Resume on subsequent turns
            ...(sessionId ? { resume: sessionId } : {}),
            // Attach MCP server with custom tools
            ...(mcpServer ? { mcpServers: { "symphony-tools": mcpServer } } : {}),
          },
        });

        let turnResult: SDKResultMessage | undefined;

        // Process SDK message stream
        for await (const msg of queryResult) {
          if (abortController.signal.aborted) break;

          // Extract session ID from init message
          if (!sessionId && "session_id" in msg && typeof msg.session_id === "string") {
            sessionId = msg.session_id;
            session.session_id = sessionId;
            session.thread_id = sessionId;
          }

          // Track token usage
          const tokens = extractTokenUsage(msg);
          if (tokens) {
            session.codex_input_tokens += tokens.input_tokens;
            session.codex_output_tokens += tokens.output_tokens;
            session.codex_total_tokens = session.codex_input_tokens + session.codex_output_tokens;
          }

          // Map to runtime event
          const event = mapSdkMessage(msg, issue.id);
          if (event) {
            emitEvent(event);
          }

          // Check for result message
          if (msg.type === "result") {
            turnResult = msg;
          }
        }

        // Check turn result
        if (turnResult && turnResult.subtype !== "success") {
          const errorMsg = turnResult.subtype === "error_during_execution"
            ? turnResult.errors.join("; ")
            : `Turn ended with: ${turnResult.subtype}`;
          issueLog.warn(`Turn ${turn + 1} ended with error: ${errorMsg}`);
          if (turn >= config.agent.max_turns - 1) {
            return {
              status: "failed",
              error: errorMsg,
              session,
              events,
            };
          }
        }

        // If this is the last turn, we're done
        if (turn >= config.agent.max_turns - 1) {
          issueLog.info("Max turns reached");
          break;
        }

        // Set up continuation prompt for next turn
        currentPrompt = buildContinuationPrompt(issue, turn + 1);
      } finally {
        clearTimeout(turnTimeout);
      }
    }

    issueLog.info("Agent session completed successfully");
    return { status: "completed", session, events };
  } catch (err) {
    if (abortController.signal.aborted) {
      issueLog.info("Agent session aborted");
      return { status: "killed", session, events };
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    issueLog.error(`Agent session failed: ${errorMsg}`);
    return { status: "failed", error: errorMsg, session, events };
  }
}
