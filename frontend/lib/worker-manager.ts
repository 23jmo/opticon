import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  addAgent,
  getSession,
  updateAgentStatus,
} from "./session-store";
import type { Agent } from "./types";

// Track worker processes per session
const workerProcesses = new Map<string, Map<string, ChildProcess>>();

// process.cwd() returns frontend/ in Next.js dev; go up one level to project root
const PROJECT_ROOT = path.resolve(process.cwd(), "..");

export function spawnWorkers(sessionId: string, agentCount: number): void {
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const sessionWorkers = new Map<string, ChildProcess>();
  workerProcesses.set(sessionId, sessionWorkers);

  for (let i = 0; i < agentCount; i++) {
    const agentId = uuidv4();
    const agent: Agent = {
      id: agentId,
      sessionId,
      status: "booting",
      currentTaskId: null,
      tasksCompleted: 0,
      tasksTotal: 0,
    };
    addAgent(sessionId, agent);

    const pythonPath = process.env.PYTHON_PATH || "python3";
    const workerProcess = spawn(pythonPath, ["workers/worker.py"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        SESSION_ID: sessionId,
        AGENT_ID: agentId,
        SOCKET_URL: `http://localhost:${process.env.PORT || "3000"}`,
        E2B_API_KEY: process.env.E2B_API_KEY || "",
        DEDALUS_API_KEY: process.env.DEDALUS_API_KEY || "",
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
