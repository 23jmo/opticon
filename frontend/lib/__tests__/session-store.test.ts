import { describe, it, expect, beforeEach } from "vitest";

// Each test file gets a fresh module instance via dynamic import to avoid
// shared in-memory state between describe blocks.

async function freshStore() {
  // vitest module cache is reset between files but NOT between tests in the
  // same file. We work around this by always creating a brand-new session for
  // each test so the Map entries don't collide.
  const mod = await import("../session-store");
  return mod;
}

describe("session-store", () => {
  let store: Awaited<ReturnType<typeof freshStore>>;

  beforeEach(async () => {
    store = await freshStore();
  });

  // ---- createSession ----

  describe("createSession", () => {
    it("returns a session with correct shape and initial values", () => {
      const session = store.createSession("s1", "do stuff", 2);

      expect(session).toMatchObject({
        id: "s1",
        prompt: "do stuff",
        agentCount: 2,
        status: "decomposing",
        todos: [],
        agents: [],
      });
      expect(typeof session.createdAt).toBe("number");
    });

    it("stores the session so getSession can retrieve it", () => {
      store.createSession("s2", "hello", 1);
      const retrieved = store.getSession("s2");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("s2");
    });
  });

  // ---- getSession ----

  describe("getSession", () => {
    it("returns undefined for a missing session ID", () => {
      expect(store.getSession("nonexistent")).toBeUndefined();
    });
  });

  // ---- addTodos ----

  describe("addTodos", () => {
    it("creates N todos with pending status", () => {
      store.createSession("s3", "prompt", 2);
      const todos = store.addTodos("s3", ["Task A", "Task B", "Task C"]);

      expect(todos).toHaveLength(3);
      for (const todo of todos) {
        expect(todo.status).toBe("pending");
        expect(todo.assignedTo).toBeNull();
        expect(typeof todo.id).toBe("string");
      }
    });

    it("sets session status to running", () => {
      store.createSession("s4", "prompt", 1);
      store.addTodos("s4", ["Task A"]);

      const session = store.getSession("s4");
      expect(session!.status).toBe("running");
    });

    it("throws when session does not exist", () => {
      expect(() => store.addTodos("nope", ["a"])).toThrow();
    });
  });

  // ---- assignTask ----

  describe("assignTask", () => {
    it("marks todo as assigned and updates agent status", () => {
      store.createSession("s5", "p", 1);
      const [todo] = store.addTodos("s5", ["Do X"]);
      store.addAgent("s5", {
        id: "agent-1",
        sessionId: "s5",
        status: "idle",
        currentTaskId: null,
      });

      const assigned = store.assignTask("s5", todo.id, "agent-1");

      expect(assigned.status).toBe("assigned");
      expect(assigned.assignedTo).toBe("agent-1");

      const session = store.getSession("s5")!;
      const agent = session.agents.find((a) => a.id === "agent-1");
      expect(agent!.status).toBe("working");
      expect(agent!.currentTaskId).toBe(todo.id);
    });
  });

  // ---- completeTask ----

  describe("completeTask", () => {
    it("marks todo completed and sets agent to idle", () => {
      store.createSession("s6", "p", 1);
      const [todo] = store.addTodos("s6", ["Do Y"]);
      store.addAgent("s6", {
        id: "agent-2",
        sessionId: "s6",
        status: "idle",
        currentTaskId: null,
      });
      store.assignTask("s6", todo.id, "agent-2");

      const completed = store.completeTask("s6", todo.id, "done!");

      expect(completed.status).toBe("completed");
      expect(completed.result).toBe("done!");

      const session = store.getSession("s6")!;
      const agent = session.agents.find((a) => a.id === "agent-2");
      expect(agent!.status).toBe("idle");
      expect(agent!.currentTaskId).toBeNull();
    });

    it("sets session status to completed when all todos are done", () => {
      store.createSession("s7", "p", 1);
      const todos = store.addTodos("s7", ["A", "B"]);
      store.addAgent("s7", {
        id: "agent-3",
        sessionId: "s7",
        status: "idle",
        currentTaskId: null,
      });

      store.assignTask("s7", todos[0].id, "agent-3");
      store.completeTask("s7", todos[0].id);

      // Session should still be running — one todo left
      expect(store.getSession("s7")!.status).toBe("running");

      store.assignTask("s7", todos[1].id, "agent-3");
      store.completeTask("s7", todos[1].id);

      // Now all done
      expect(store.getSession("s7")!.status).toBe("completed");
    });
  });

  // ---- getNextPendingTask ----

  describe("getNextPendingTask", () => {
    it("returns the first pending todo", () => {
      store.createSession("s8", "p", 1);
      store.addTodos("s8", ["First", "Second"]);

      const next = store.getNextPendingTask("s8");
      expect(next).toBeDefined();
      expect(next!.description).toBe("First");
    });

    it("returns undefined when no pending todos remain", () => {
      store.createSession("s9", "p", 1);
      const [todo] = store.addTodos("s9", ["Only"]);
      store.addAgent("s9", {
        id: "a1",
        sessionId: "s9",
        status: "idle",
        currentTaskId: null,
      });
      store.assignTask("s9", todo.id, "a1");
      store.completeTask("s9", todo.id);

      expect(store.getNextPendingTask("s9")).toBeUndefined();
    });

    it("returns undefined for nonexistent session", () => {
      expect(store.getNextPendingTask("ghost")).toBeUndefined();
    });
  });

  // ---- addAgent / updateAgentStatus ----

  describe("addAgent and updateAgentStatus", () => {
    it("adds an agent to the session", () => {
      store.createSession("s10", "p", 1);
      store.addAgent("s10", {
        id: "a-x",
        sessionId: "s10",
        status: "booting",
        currentTaskId: null,
      });

      const session = store.getSession("s10")!;
      expect(session.agents).toHaveLength(1);
      expect(session.agents[0].id).toBe("a-x");
      expect(session.agents[0].status).toBe("booting");
    });

    it("updates agent status", () => {
      store.createSession("s11", "p", 1);
      store.addAgent("s11", {
        id: "a-y",
        sessionId: "s11",
        status: "booting",
        currentTaskId: null,
      });

      store.updateAgentStatus("s11", "a-y", "working");

      const session = store.getSession("s11")!;
      const agent = session.agents.find((a) => a.id === "a-y");
      expect(agent!.status).toBe("working");
    });

    it("throws when adding agent to nonexistent session", () => {
      expect(() =>
        store.addAgent("nope", {
          id: "a",
          sessionId: "nope",
          status: "booting",
          currentTaskId: null,
        })
      ).toThrow();
    });

    it("silently no-ops when updating status for nonexistent session", () => {
      // updateAgentStatus returns early if session not found (no throw)
      expect(() =>
        store.updateAgentStatus("nope", "a", "terminated")
      ).not.toThrow();
    });
  });
});
