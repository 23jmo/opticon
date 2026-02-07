# Frontend / Backend Server

Next.js application that serves both the web UI and the backend orchestration layer. A custom `server.ts` boots an HTTP server with Socket.io, then hands requests to Next.js.

## What it does

- **Orchestrator** — receives a user prompt, calls Dedalus Labs SDK (routing to Claude) to decompose it into independent tasks, stores them in an in-memory session store.
- **Worker spawner** — spawns one Python agent process per task. Each worker controls an E2B cloud desktop sandbox.
- **Real-time relay** — Socket.io pushes task lifecycle events and agent reasoning to connected browsers.

## Prerequisites

- Node.js 20+
- Python 3.10+ (for agent workers)
- API keys: `DEDALUS_API_KEY`, `E2B_API_KEY`

## Setup

```bash
npm install
```

Create `.env.local` in this directory:

```
DEDALUS_API_KEY=...
E2B_API_KEY=...
```

## Running

```bash
npm run dev        # Starts custom server on http://localhost:3000
npm run build      # Production build
npm test           # Run unit tests (vitest)
```

## API Endpoints

### `POST /api/sessions`

Create a new session. Decomposes the prompt into tasks and spawns agent workers.

**Request body:**

```json
{ "prompt": "Research and compare...", "agentCount": 3 }
```

**Response (201):**

```json
{ "sessionId": "uuid" }
```

### `GET /api/sessions/[id]`

Fetch full session state (todos, agents, status).

**Response (200):** `Session` object. Returns 404 if not found.

## Socket.io Events

Clients join a session room by emitting `session:join` with the session ID.

| Event | Direction | Payload |
|-------|-----------|---------|
| `session:join` | client -> server | `sessionId` |
| `session:leave` | client -> server | `sessionId` |
| `task:created` | server -> client | `Todo` |
| `task:assigned` | server -> client | `{ todoId, agentId }` |
| `task:completed` | server -> client | `{ todoId, agentId, result? }` |
| `agent:thinking` | server -> client | `{ agentId, action, timestamp }` |
| `agent:reasoning` | server -> client | `{ agentId, reasoning, timestamp }` |
| `agent:terminated` | server -> client | `{ agentId }` |
| `session:complete` | server -> client | `{ sessionId }` |

## Worker stdout Protocol

Python workers communicate with the Node.js backend via JSON lines on stdout. Each line must be valid JSON with a `type` field:

```jsonl
{"type": "sandbox_ready", "sandboxId": "...", "streamUrl": "..."}
{"type": "log", "action": "clicking button", "reasoning": "I see a login form..."}
{"type": "complete", "todoId": "uuid", "result": "Task finished successfully"}
```

The backend sends new task assignments to the worker's stdin as JSON lines:

```jsonl
{"taskId": "uuid", "description": "Next task to execute"}
```
