import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  addAgent,
  getSession,
  updateAgentStatus,
} from "./session-store";
import { getSlackSessionBySessionId } from "./slack/session-adapter";
import type { Agent } from "./types";

// Track worker processes per session
const workerProcesses = new Map<string, Map<string, ChildProcess>>();

// In dev, cwd is frontend/ so go up one level. In Docker, cwd is /app and workers/ is a sibling.
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), "..");

export function spawnWorkers(sessionId: string, agentCount: number): void {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const sessionWorkers = new Map<string, ChildProcess>();
  workerProcesses.set(sessionId, sessionWorkers);

  for (let i = 0; i < agentCount; i++) {
    const agentId = uuidv4();
    const agent: Agent = {
      id: agentId,
      name: `Agent ${i + 1}`,
      sessionId,
      status: "booting",
      currentTaskId: null,
      tasksCompleted: 0,
      tasksTotal: 0,
    };
    addAgent(sessionId, agent);

    const pythonPath = process.env.PYTHON_PATH || "python3";
    const slackSession = getSlackSessionBySessionId(sessionId);
    const workerProcess = spawn(pythonPath, ["workers/worker.py"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SESSION_ID: sessionId,
        AGENT_ID: agentId,
        USER_ID: session.userId || "",
        SOCKET_URL: `http://localhost:${process.env.PORT || "3000"}`,
        E2B_API_KEY: process.env.E2B_API_KEY || "",
        DEDALUS_API_KEY: process.env.DEDALUS_API_KEY || "",
        // Panopticon: Enable long-running mode for Panopticon sessions
        PANOPTICON_MODE: session.isPanopticon ? "true" : "false",
        // Slack: enable step checkpoints when running from a Slack session
        ...(slackSession ? { SLACK_SESSION: "true" } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    sessionWorkers.set(agentId, workerProcess);
    console.log(
      `[worker-manager] Spawned worker for agent ${agentId} (pid: ${workerProcess.pid})`
    );

    // Log stdout (worker may print debug info)
    workerProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[worker:${agentId}] ${data.toString().trim()}`);
    });

    // Log stderr
    workerProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[worker:${agentId}:stderr] ${data.toString().trim()}`);
    });

    workerProcess.on("exit", (code) => {
      console.log(`[worker-manager] Agent ${agentId} exited with code ${code}`);
      sessionWorkers.delete(agentId);
    });
  }
}

export function respawnWorker(sessionId: string, agent: Agent): void {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  let sessionWorkers = workerProcesses.get(sessionId);
  if (!sessionWorkers) {
    sessionWorkers = new Map<string, ChildProcess>();
    workerProcesses.set(sessionId, sessionWorkers);
  }

  // Don't respawn if already running
  if (sessionWorkers.has(agent.id)) return;

  const pythonPath = process.env.PYTHON_PATH || "python3";
  const workerProcess = spawn(pythonPath, ["workers/worker.py"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      SESSION_ID: sessionId,
      AGENT_ID: agent.id,
      USER_ID: session.userId || "",
      SOCKET_URL: `http://localhost:${process.env.PORT || "3000"}`,
      E2B_API_KEY: process.env.E2B_API_KEY || "",
      DEDALUS_API_KEY: process.env.DEDALUS_API_KEY || "",
      SANDBOX_ID: agent.sandboxId || "",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  sessionWorkers.set(agent.id, workerProcess);
  console.log(
    `[worker-manager] Respawned worker for agent ${agent.id} (pid: ${workerProcess.pid}, sandbox: ${agent.sandboxId})`
  );

  workerProcess.stdout?.on("data", (data: Buffer) => {
    console.log(`[worker:${agent.id}] ${data.toString().trim()}`);
  });

  workerProcess.stderr?.on("data", (data: Buffer) => {
    console.error(`[worker:${agent.id}:stderr] ${data.toString().trim()}`);
  });

  workerProcess.on("exit", (code) => {
    console.log(`[worker-manager] Agent ${agent.id} exited with code ${code}`);
    sessionWorkers?.delete(agent.id);
  });
}

export function killAllWorkers(sessionId: string): void {
  const sessionWorkers = workerProcesses.get(sessionId);
  if (!sessionWorkers) return;

  for (const [agentId, proc] of sessionWorkers) {
    console.log(`[worker-manager] Killing worker ${agentId}`);
    proc.kill("SIGTERM");
    updateAgentStatus(sessionId, agentId, "terminated");
  }

  workerProcesses.delete(sessionId);
}
