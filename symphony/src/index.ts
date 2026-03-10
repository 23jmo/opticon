// CLI entry point (§17.7)

import { resolve } from "node:path";
import { parseWorkflowFile, watchWorkflowFile } from "./config/workflow-loader.js";
import { buildConfig, validateConfig, reloadConfig } from "./config/config.js";
import { LinearClient } from "./tracker/linear-client.js";
import { WorkspaceManager } from "./workspace/workspace-manager.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { createHttpServer } from "./server/http-server.js";
import { createLogger, setLogLevel } from "./util/logger.js";
import type { ServiceConfig, WorkflowConfig } from "./types.js";

const log = createLogger("symphony");

function parseArgs(argv: string[]): { workflowPath: string; port?: number; logLevel?: string } {
  let workflowPath = "./WORKFLOW.md";
  let port: number | undefined;
  let logLevel: string | undefined;

  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--port" && i + 1 < args.length) {
      port = parseInt(args[++i], 10);
      if (isNaN(port)) {
        console.error("Error: --port requires a valid number");
        process.exit(1);
      }
    } else if (arg === "--log-level" && i + 1 < args.length) {
      logLevel = args[++i];
    } else if (!arg.startsWith("--")) {
      workflowPath = arg;
    }
  }

  return { workflowPath: resolve(workflowPath), port, logLevel };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.logLevel) {
    setLogLevel(args.logLevel as "debug" | "info" | "warn" | "error");
  }

  log.info("Starting Symphony");

  // 1. Load + validate workflow
  let workflow: WorkflowConfig;
  try {
    workflow = parseWorkflowFile(args.workflowPath);
    log.info(`Loaded workflow from ${args.workflowPath}`);
  } catch (err) {
    log.error(`Failed to load workflow: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // 2. Build and validate config
  let config: ServiceConfig = buildConfig(workflow, { port: args.port });
  const errors = validateConfig(config);
  if (errors.length > 0) {
    for (const error of errors) {
      log.error(`Config error: ${error}`);
    }
    process.exit(1);
  }

  // 3. Initialize components
  const tracker = new LinearClient(config.tracker);
  const workspaceManager = new WorkspaceManager(config.workspace, config.hooks);
  const orchestrator = new Orchestrator(config, tracker, workspaceManager, workflow.prompt_template);

  // 4. Start workflow file watcher
  const watcher = watchWorkflowFile(args.workflowPath, (updatedWorkflow) => {
    workflow = updatedWorkflow;
    config = reloadConfig(config, workflow, { port: args.port });
    orchestrator.updateConfig(config, workflow.prompt_template);
  });

  // 5. Startup terminal cleanup
  await orchestrator.startupCleanup();

  // 6. Start HTTP server if configured
  let httpServer: { stop: () => Promise<void> } | null = null;
  if (config.server) {
    const http = createHttpServer(config.server.port, orchestrator);
    await http.start();
    httpServer = http;
  }

  // 7. Start orchestrator (poll loop)
  orchestrator.start();

  // 8. Signal handling
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info(`Received ${signal}, shutting down...`);

    await orchestrator.stop();
    await watcher.close();

    if (httpServer) {
      await httpServer.stop();
    }

    log.info("Symphony stopped");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
