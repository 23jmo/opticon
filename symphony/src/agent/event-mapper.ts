// Maps Claude Agent SDK messages to Symphony runtime events (§10)

import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, RuntimeEventType } from "../types.js";

/**
 * Map a Claude Agent SDK message to a Symphony runtime event.
 */
export function mapSdkMessage(
  msg: SDKMessage,
  issueId: string,
): RuntimeEvent | null {
  const timestamp = new Date().toISOString();
  let type: RuntimeEventType | null = null;
  const data: Record<string, unknown> = {};

  switch (msg.type) {
    case "system":
      type = "agent:start";
      data.session_id = msg.session_id;
      break;

    case "assistant":
      type = "agent:message";
      // BetaMessage has content blocks
      if (msg.message?.content) {
        const textBlocks = msg.message.content.filter(
          (b: { type: string }) => b.type === "text",
        );
        if (textBlocks.length > 0) {
          data.message = (textBlocks[0] as { text: string }).text?.slice(0, 500);
        }

        const toolBlocks = msg.message.content.filter(
          (b: { type: string }) => b.type === "tool_use",
        );
        if (toolBlocks.length > 0) {
          data.tool_use = true;
          data.tool_name = (toolBlocks[0] as { name?: string }).name;
        }
      }
      break;

    case "result":
      if (msg.subtype === "success") {
        type = "agent:turn_complete";
        data.result = msg.result?.slice(0, 500);
      } else {
        type = "agent:error";
        data.errors = msg.errors;
      }
      break;

    default:
      // stream_event, tool_progress, etc — skip for now
      return null;
  }

  if (!type) return null;
  return { type, issue_id: issueId, timestamp, data };
}

/**
 * Extract token usage from an SDK result message.
 */
export function extractTokenUsage(msg: SDKMessage): {
  input_tokens: number;
  output_tokens: number;
} | null {
  if (msg.type === "result") {
    const resultMsg = msg as SDKResultMessage;
    if (resultMsg.usage) {
      return {
        input_tokens: resultMsg.usage.input_tokens ?? 0,
        output_tokens: resultMsg.usage.output_tokens ?? 0,
      };
    }
  }
  return null;
}
