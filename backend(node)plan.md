# Backend Node.js Implementation Plan

Branch: `backend-node`

## Prerequisites

Install new dependencies in `frontend/`:
```bash
npm install socket.io @anthropic-ai/sdk uuid
npm install -D @types/uuid tsx
```

Update `frontend/package.json` scripts:
```json
"dev": "tsx server.ts",
"start": "NODE_ENV=production node server.js"
```

---

## Step 1: Shared Types (`frontend/lib/types.ts`)

```typescript
export type SessionStatus = 'decomposing' | 'running' | 'completed' | 'failed'

export interface Todo {
  id: string
  description: string
  status: 'pending' | 'assigned' | 'completed'
  assignedTo: string | null
  result?: string
}

export interface Agent {
  id: string
  sessionId: string
  status: 'booting' | 'working' | 'idle' | 'terminated'
  currentTaskId: string | null
  sandboxId?: string
  streamUrl?: string
}

export interface Session {
  id: string
  prompt: string
  agentCount: number
  status: SessionStatus
  todos: Todo[]
  agents: Agent[]
  createdAt: number
}

export interface ServerToClientEvents {
  'task:created': (todo: Todo) => void
  'task:assigned': (payload: { todoId: string; agentId: string }) => void
  'task:completed': (payload: { todoId: string; agentId: string; result?: string }) => void
  'agent:thinking': (payload: { agentId: string; action: string; timestamp: number }) => void
  'agent:reasoning': (payload: { agentId: string; reasoning: string; timestamp: number }) => void
  'agent:terminated': (payload: { agentId: string }) => void
  'session:complete': (payload: { sessionId: string }) => void
}

export interface ClientToServerEvents {
  'session:join': (sessionId: string) => void
  'session:leave': (sessionId: string) => void
}
```

---

## Step 2: In-Memory Session Store (`frontend/lib/session-store.ts`)

Singleton `Map<string, Session>` with helpers:

- `createSession(id, prompt, agentCount): Session`
- `getSession(id): Session | undefined`
- `addTodos(sessionId, descriptions: string[]): Todo[]`
- `assignTask(sessionId, todoId, agentId): Todo`
- `completeTask(sessionId, todoId, result?): Todo`
- `getNextPendingTask(sessionId): Todo | undefined`
- `addAgent(sessionId, agent: Agent): void`
- `updateAgentStatus(sessionId, agentId, status): void`

---

## Step 3: Socket.io Server + Custom Server (`frontend/server.ts`, `frontend/lib/socket.ts`)

Custom HTTP server wrapping Next.js + Socket.io. `lib/socket.ts` exports `setIO()`/`getIO()` singleton for use in API routes. Room pattern: `session:<sessionId>`.

---

## Step 4: Session API Routes

**POST `/api/sessions`** (`frontend/app/api/sessions/route.ts`)

Request: `{ prompt: string, agentCount: number }`

1. Validate input (prompt non-empty, agentCount 1-4)
2. Generate session ID via `uuid.v4()`
3. Create session in store
4. Call Claude API to decompose prompt into TODOs (model: `claude-sonnet-4-5-20250929`, system prompt instructs decomposition into `{agentCount}` independent tasks, JSON response: `{ todos: [{ description }] }`)
5. Add TODOs to session store
6. Emit `task:created` events via Socket.io
7. Spawn worker processes via worker-manager
8. Return `{ sessionId }` with 201 status

**GET `/api/sessions/[id]`** (`frontend/app/api/sessions/[id]/route.ts`)
- Return full session state, 404 if not found

---

## Step 5: Worker Spawner (`frontend/lib/worker-manager.ts`)

**IPC model:** No file-based IPC. Workers receive their task via env vars at spawn time and report back via stdout JSON lines.

**`spawnWorkers(sessionId, agentCount): void`**
- For each agent:
  - Generate agent ID, add to session store
  - Assign a pending task via `assignTask()`
  - Spawn `python3 workers/worker.py` with env vars: `SESSION_ID`, `AGENT_ID`, `TASK_ID`, `TASK_DESCRIPTION`, `SOCKET_URL`, `E2B_API_KEY`, `DEDALUS_API_KEY`
  - CWD: project root (parent of `frontend/`)
  - Emit `task:assigned` event
- Attach stdout line parser to each worker process

**`handleWorkerMessage(sessionId, agentId, message)`** — parse stdout JSON lines:
- `{ type: 'log', action: '...' }` → emit `agent:thinking`
- `{ type: 'log', reasoning: '...' }` → emit `agent:reasoning`
- `{ type: 'complete', todoId: '...' }` → mark task complete, then either:
  - Assign next pending task by spawning a new worker (or writing to stdin), emit `task:assigned`
  - Or if no tasks remain, mark agent terminated, emit `agent:terminated`
  - If all agents terminated, emit `session:complete`
- `{ type: 'sandbox_ready', sandboxId, streamUrl }` → update agent in store, emit to room

**`killAllWorkers(sessionId): void`** — cleanup on session abort

---

## Files to Create (in order)

| # | File | Purpose |
|---|------|---------|
| 1 | `frontend/lib/types.ts` | Shared TypeScript types |
| 2 | `frontend/lib/session-store.ts` | In-memory session/TODO state |
| 3 | `frontend/lib/socket.ts` | Socket.io singleton accessor |
| 4 | `frontend/server.ts` | Custom server (Next.js + Socket.io) |
| 5 | `frontend/app/api/sessions/route.ts` | POST: create session |
| 6 | `frontend/app/api/sessions/[id]/route.ts` | GET: session status |
| 7 | `frontend/lib/worker-manager.ts` | Python process spawner |

## Verification

1. `cd frontend && npm install` — install new deps
2. `npm run dev` — starts custom server on :3000
3. `curl -X POST http://localhost:3000/api/sessions -H 'Content-Type: application/json' -d '{"prompt":"Research AI agents","agentCount":2}'` — should return `{ sessionId: "..." }`
4. `curl http://localhost:3000/api/sessions/<id>` — should return session with decomposed TODOs
5. Socket.io client can connect and join session room
6. Worker processes spawn (will fail without Python setup, but spawner logs should show the attempt)
