// Optional linear_graphql client-side tool extension (§10.5)

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { LinearClient } from "../tracker/linear-client.js";
import { createLogger } from "../util/logger.js";

const log = createLogger("linear-graphql-tool");

const toolSchema = {
  query: z.string().describe("The GraphQL query or mutation string. Must be a single operation."),
  variables: z.record(z.string(), z.unknown()).optional().describe("Optional variables for the GraphQL operation."),
};

/**
 * Create the linear_graphql tool definition for Claude Code sessions.
 * Uses the SDK's tool() helper to produce an SdkMcpToolDefinition.
 */
export function createLinearGraphqlTool(linearClient: LinearClient) {
  return tool(
    "linear_graphql",
    "Execute a raw GraphQL query against the Linear API using Symphony's configured authentication. " +
    "Use this to query or mutate Linear data (issues, comments, labels, etc.). " +
    "The query must be a single GraphQL operation.",
    toolSchema,
    async (args) => {
      const queryStr = args.query.trim();
      if (!queryStr) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "query must be non-empty" }) }] };
      }

      // Basic single-operation validation
      const operationCount = (queryStr.match(/\b(query|mutation|subscription)\b/gi) || []).length;
      if (operationCount > 1) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: "query must contain a single operation" }) }],
        };
      }

      try {
        const result = await linearClient.rawGraphql(queryStr, args.variables as Record<string, unknown> | undefined);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, data: result }) }] };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        log.warn(`linear_graphql tool error: ${errorMsg}`);
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: errorMsg }) }] };
      }
    },
  );
}
