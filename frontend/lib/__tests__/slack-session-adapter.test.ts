import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the adapter import
// ---------------------------------------------------------------------------

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-1234"),
}));

vi.mock("../session-store", () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  addTodos: vi.fn(() => [
    { id: "t1", description: "Task A", status: "pending", assignedTo: null },
    { id: "t2", description: "Task B", status: "pending", assignedTo: null },
  ]),
}));

vi.mock("../orchestrator", () => ({
  decomposeTasks: vi.fn(async () => ["Task A", "Task B"]),
}));

vi.mock("../worker-manager", () => ({
  spawnWorkers: vi.fn(),
  killAllWorkers: vi.fn(),
}));

vi.mock("../db/session-persist", () => ({
  persistSession: vi.fn(async () => {}),
  persistTodos: vi.fn(async () => {}),
  persistSessionStatus: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createSlackSession,
  decomposeSlackSession,
  executeSlackSession,
  getSlackSession,
  getSlackSessionBySessionId,
  updateSlackSessionStatus,
  completeSlackSession,
  stopSlackSession,
} from "../slack/session-adapter";

import { createSession, getSession, addTodos } from "../session-store";
import { decomposeTasks } from "../orchestrator";
import { spawnWorkers, killAllWorkers } from "../worker-manager";
import {
  persistSession,
  persistTodos,
  persistSessionStatus,
} from "../db/session-persist";

// ---------------------------------------------------------------------------
// Reset in-memory store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Wipe the in-memory session map
  const g = globalThis as unknown as {
    __slack_sessions?: Map<string, unknown>;
  };
  g.__slack_sessions?.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSlackSession", () => {
  it("returns correct shape and persists the session", async () => {
    const session = await createSlackSession(
      "thread-1",
      "C123",
      "U456",
      "T789",
      "build an app",
      2,
    );

    expect(session).toMatchObject({
      threadTs: "thread-1",
      channelId: "C123",
      sessionId: "mock-uuid-1234",
      userId: "U456",
      teamId: "T789",
      status: "clarifying",
    });
    expect(typeof session.createdAt).toBe("number");

    expect(createSession).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "build an app",
      2,
      "U456",
    );
    expect(persistSession).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "U456",
      "build an app",
      2,
      "clarifying",
    );
  });

  it("is retrievable via getSlackSession afterward", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    const found = getSlackSession("t1", "C1");
    expect(found).toBeDefined();
    expect(found!.sessionId).toBe("mock-uuid-1234");
  });
});

describe("decomposeSlackSession", () => {
  it("decomposes tasks and does NOT spawn workers", async () => {
    // Set up the in-memory session so getSession returns something
    vi.mocked(getSession).mockReturnValue({
      id: "mock-uuid-1234",
      prompt: "build an app",
      agentCount: 2,
      status: "decomposing",
      todos: [],
      agents: [],
      createdAt: Date.now(),
    });

    await createSlackSession("t1", "C1", "U1", "T1", "build an app", 2);
    const result = await decomposeSlackSession("t1", "C1");

    expect(result.descriptions).toEqual(["Task A", "Task B"]);
    expect(decomposeTasks).toHaveBeenCalledWith("build an app", 2);
    expect(addTodos).toHaveBeenCalledWith("mock-uuid-1234", ["Task A", "Task B"]);
    expect(persistTodos).toHaveBeenCalled();

    // Workers should NOT have been spawned
    expect(spawnWorkers).not.toHaveBeenCalled();

    // Status should be pending_approval
    const session = getSlackSession("t1", "C1");
    expect(session!.status).toBe("pending_approval");
    expect(persistSessionStatus).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "pending_approval",
    );
  });

  it("throws when no Slack session exists", async () => {
    await expect(
      decomposeSlackSession("nonexistent", "C1"),
    ).rejects.toThrow(/No Slack session found/);
  });
});

describe("executeSlackSession", () => {
  it("spawns workers and sets status to running", async () => {
    vi.mocked(getSession).mockReturnValue({
      id: "mock-uuid-1234",
      prompt: "build an app",
      agentCount: 2,
      status: "pending_approval",
      todos: [],
      agents: [],
      createdAt: Date.now(),
    });

    await createSlackSession("t1", "C1", "U1", "T1", "build an app", 2);
    // Manually set status to pending_approval (simulating decompose)
    updateSlackSessionStatus("t1", "C1", "pending_approval");

    await executeSlackSession("t1", "C1");

    expect(spawnWorkers).toHaveBeenCalledWith("mock-uuid-1234", 2);
    expect(persistSessionStatus).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "running",
    );

    const session = getSlackSession("t1", "C1");
    expect(session!.status).toBe("running");
  });

  it("guards against double execution (no-op if already running)", async () => {
    vi.mocked(getSession).mockReturnValue({
      id: "mock-uuid-1234",
      prompt: "build an app",
      agentCount: 2,
      status: "running",
      todos: [],
      agents: [],
      createdAt: Date.now(),
    });

    await createSlackSession("t1", "C1", "U1", "T1", "build an app", 2);
    // Session is still "clarifying" — not "pending_approval"
    await executeSlackSession("t1", "C1");

    // spawnWorkers should NOT have been called
    expect(spawnWorkers).not.toHaveBeenCalled();
  });

  it("throws when no Slack session exists", async () => {
    await expect(
      executeSlackSession("nonexistent", "C1"),
    ).rejects.toThrow(/No Slack session found/);
  });
});

describe("getSlackSession / getSlackSessionBySessionId", () => {
  it("looks up by thread coordinates", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    expect(getSlackSession("t1", "C1")).toBeDefined();
    expect(getSlackSession("t1", "C999")).toBeUndefined();
  });

  it("looks up by Panopticon session ID", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    expect(getSlackSessionBySessionId("mock-uuid-1234")).toBeDefined();
    expect(getSlackSessionBySessionId("nope")).toBeUndefined();
  });
});

describe("updateSlackSessionStatus", () => {
  it("mutates the in-memory status", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    updateSlackSessionStatus("t1", "C1", "running");
    expect(getSlackSession("t1", "C1")!.status).toBe("running");
  });

  it("no-ops for nonexistent session", () => {
    expect(() =>
      updateSlackSessionStatus("nope", "C1", "running"),
    ).not.toThrow();
  });
});

describe("completeSlackSession", () => {
  it("sets status to completed and persists with timestamp", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    await completeSlackSession("t1", "C1");

    expect(getSlackSession("t1", "C1")!.status).toBe("completed");
    expect(persistSessionStatus).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "completed",
      expect.any(Date),
    );
  });

  it("no-ops for nonexistent session", async () => {
    await expect(completeSlackSession("nope", "C1")).resolves.toBeUndefined();
  });
});

describe("stopSlackSession", () => {
  it("kills workers, sets status to failed, and persists", async () => {
    await createSlackSession("t1", "C1", "U1", "T1", "prompt", 1);
    await stopSlackSession("t1", "C1");

    expect(getSlackSession("t1", "C1")!.status).toBe("failed");
    expect(killAllWorkers).toHaveBeenCalledWith("mock-uuid-1234");
    expect(persistSessionStatus).toHaveBeenCalledWith(
      "mock-uuid-1234",
      "failed",
    );
  });

  it("no-ops for nonexistent session", async () => {
    await expect(stopSlackSession("nope", "C1")).resolves.toBeUndefined();
  });
});
