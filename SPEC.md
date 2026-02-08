# Opticon — Technical Specification

## Overview

Opticon is a web platform where users submit natural language prompts (e.g., "Research AI agents and create a Google Doc summarizing your findings"). An orchestrator decomposes the prompt into independent tasks, the user reviews and approves the task breakdown, then multiple AI agents each boot their own cloud Linux desktop and execute tasks in parallel. Live desktop streams, agent reasoning, and a read-only shared whiteboard are all visible in the browser.

Built as a polished demo. Reliability and visual quality over feature breadth.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tab Bar: [Agent 1 ● 2/3] [Agent 2 ● 1/3] [Whiteboard] │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                         │                                │   │
│  │   Desktop Stream        │   Thinking Panel (sidebar)     │   │
│  │   (noVNC / E2B stream)  │   - Grouped by LLM reasoning  │   │
│  │   (view-only)           │   - Expandable tool calls      │   │
│  │                         │   - Per-agent (tab-scoped)     │   │
│  │                         │                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                       Socket.io                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────────────────┐
│                  Next.js Backend (custom server.ts)              │
│                                                                 │
│  ┌─────────────┐   ┌────────────────────────────────────────┐   │
│  │ Orchestrator │   │     In-Memory Session Store             │   │
│  │ (Dedalus     │──▶│  - Task list with status                │   │
│  │  chat.compl.)│   │  - Agent state                          │   │
│  │ Decomposes   │   │  - Shared whiteboard (read-only)         │   │
│  │ prompt       │   │  - Push model (backend assigns tasks)   │   │
│  └─────────────┘   └────────────────────────────────────────┘   │
│                              │                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                   │
│  │ Python    │  │ Python    │  │ Python    │  ...               │
│  │ Worker 1  │  │ Worker 2  │  │ Worker 3  │                   │
│  │ (Daedalus)│  │ (Daedalus)│  │ (Daedalus)│                   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                   │
│        │  Socket.io    │  Socket.io    │  Socket.io              │
└────────┼───────────────┼───────────────┼────────────────────────┘
         │               │               │
┌────────┼───────────────┼───────────────┼────────────────────────┐
│  E2B   │               │               │                        │
│  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐                  │
│  │ Sandbox 1 │  │ Sandbox 2 │  │ Sandbox 3 │  ...              │
│  │ Linux     │  │ Linux     │  │ Linux     │                   │
│  │ Desktop   │  │ Desktop   │  │ Desktop   │                   │
│  │ (30 min)  │  │ (30 min)  │  │ (30 min)  │                   │
│  └───────────┘  └───────────┘  └───────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend (Next.js App Router + Tailwind + shadcn/ui)

**Design direction:** Dark theme, cyan/teal accent, polished with subtle motion (fade-ins, slide transitions, loading skeletons). Professional but premium feel. Opticon branding (name + logo) but standard technical terminology (agents, tasks, sessions).

#### Home Screen

- Minimal: single centered input box, middle third of screen
- Inline control to select number of agents (1–4)
- Submit triggers orchestration pipeline
- No example prompts, no recent sessions — just the input

#### Task Approval Screen

After the orchestrator decomposes the prompt:
- Show the proposed task list in an editable view
- User can add, remove, or reword tasks
- User can adjust agent count (may differ from initial selection based on task count)
- No LLM re-validation of edits — trust the user
- "Start" button launches the session

#### Session View

**Tab bar:**
- One tab per agent + one "Whiteboard" tab
- Each agent tab shows a status dot: green (active), red (failed), gray (terminated)
- Each agent tab shows task progress: "Task 2/3"

**Desktop stream (center):**
- E2B's built-in noVNC streaming, scaled to fit the browser viewport
- View-only: users watch agents work but cannot interact with the desktop

**Thinking panel (right sidebar, per-agent):**
- Grouped by LLM reasoning: each turn's reasoning text is the step label
- Individual tool calls (click, type, screenshot) nest under the reasoning as expandable details
- Default: show reasoning labels, collapsed tool calls
- Errors show inline as red entries

**Whiteboard tab:**
- Separate tab alongside agent tabs
- Read-only markdown view (rendered, not editable)
- Agents write to the whiteboard to share findings and coordination notes
- Agents read whiteboard content between tasks (not mid-task)
- Freeform — no structured sections

#### Boot Sequence

While agents spin up sandboxes (10–30 seconds):
- Show skeleton desktop placeholders per agent tab
- Per-agent progress indicator: "Booting sandbox..." → "Connecting..." → "Ready"
- Tabs populate with live streams as each agent comes online (may stagger)

#### Completion

- When all agents finish, show an in-place "Session Complete" banner on the current view
- "View Summary" button navigates to the summary screen
- Desktops remain visible until the user navigates away
- Summary screen: text-only recap of tasks completed and what each agent did (no file downloads)

#### Error Handling

- Session-level errors (E2B API down, Dedalus API unreachable): toast notifications
- Per-agent errors (sandbox won't boot, task failure): inline in the agent's thinking panel as red entries
- Both shown simultaneously when applicable

### 2. Orchestrator (Backend, LLM-powered)

- Receives the user's prompt via `POST /api/sessions`
- Uses Dedalus Labs `chat.completions.create()` API to decompose the prompt into independent, parallelizable tasks
- Returns proposed task list to frontend for user approval
- After approval, stores tasks in in-memory session store
- Push model: backend assigns tasks to agents (agents don't choose tasks)
- Static decomposition: no dynamic re-planning mid-session
- Failed tasks are automatically retried on the same agent (same sandbox, no reboot) up to once

### 3. Agent Workers (Separate Python Processes)

- Each agent is a **separate Python process** spawned by the backend's worker-manager
- IPC via **Socket.io**: workers self-connect to the Socket.io server on startup
- Worker-manager still handles process lifecycle (spawn, monitor, kill)

**Vision-based agentic loop (per turn):**
1. Take a screenshot of the sandbox desktop
2. Inject screenshot as a user message (base64 image) into the conversation
3. Call Dedalus `chat.completions.create()` with tool schemas — model sees the desktop and returns a tool call
4. Execute the tool call (click, type, press key, etc.) on the E2B sandbox
5. Emit thinking/reasoning event via Socket.io
6. Loop back to step 1
7. When the model calls the `done` tool, report task completion

**Guardrails:**
- Max 500 steps per task. If not done by then, mark task as failed.

**Task lifecycle:**
1. Worker boots → creates E2B sandbox (30-minute timeout) → starts stream → emits `agent:stream_ready`
2. Reads whiteboard content
3. Executes assigned task via vision loop
4. On completion, emits `task:completed` → reads whiteboard again → receives next task (if available)
5. On failure, backend auto-retries once on the same agent
6. No more tasks → terminates sandbox → emits `agent:terminated`

### 4. Shared Whiteboard

- Freeform markdown text shared across all agents in a session
- Stored in the backend's in-memory session store
- Agents write to the whiteboard to post findings, notes, and coordination signals
- Agents read the whiteboard at task boundaries (between tasks, not mid-task)
- Read-only in the frontend — users can observe agent coordination but not edit
- Use case: agents share findings ("Found the data at URL X"), post intermediate results, coordinate handoffs

### 5. E2B Desktop Sandboxes

- Each sandbox is a cloud Linux desktop environment with full internet access
- Provisioned via `Sandbox.create()` from `e2b-desktop` Python package
- Timeout set to 1800 seconds (30 minutes) at creation — no keepalive logic
- Desktop streaming via `sandbox.stream.start()` + `sandbox.stream.get_url()` (noVNC)
- Computer control via E2B Desktop SDK:
  - `sandbox.screenshot()` — capture current screen (PNG bytes)
  - `sandbox.left_click(x, y)` — click at coordinates
  - `sandbox.double_click(x, y)` — double click
  - `sandbox.write(text)` — type text
  - `sandbox.press(key)` — press special keys / key combos
  - `sandbox.scroll(x, y, direction, amount)` — scroll
  - `sandbox.move_mouse(x, y)` — move cursor
- Sandboxes are killed when the agent completes all work or the session times out

### 6. Real-time Communication

- **Socket.io** for all real-time data: frontend ↔ backend ↔ Python workers
- One room per session (`session:<id>`)
- Python workers connect directly to the Socket.io server (no stdin/stdout relay)

**Events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `session:join` | Client → Server | `{ sessionId }` |
| `session:leave` | Client → Server | `{ sessionId }` |
| `agent:join` | Worker → Server | `{ sessionId, agentId }` |
| `agent:stream_ready` | Worker → Server | `{ agentId, streamUrl }` |
| `agent:thinking` | Worker → Server | `{ agentId, action, detail }` |
| `agent:error` | Worker → Server | `{ agentId, error }` |
| `task:completed` | Worker → Server | `{ taskId, result }` |
| `agent:terminated` | Worker → Server | `{ agentId }` |
| `task:created` | Server → Client | `{ todo }` |
| `task:assigned` | Server → Client | `{ todoId, agentId }` |
| `whiteboard:updated` | Worker → Server | `{ sessionId, content }` |
| `session:complete` | Server → Client | `{ sessionId }` |

### 7. API Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Submit prompt + agent count. Returns proposed task list. |
| `POST` | `/api/sessions/:id/approve` | User approves (optionally edited) task list + agent count. Spawns workers. |
| `GET` | `/api/sessions/:id` | Get session state (tasks, agents, status). |
| `GET` | `/api/sessions/:id/whiteboard` | Get current whiteboard content (read-only). |

### 8. API Keys & Auth

- Dedalus Labs API key: server-side (orchestrator + agent workers)
- E2B API key: server-side (sandbox provisioning)
- `PYTHON_PATH` env var: path to Python binary (worker spawning)
- No user authentication — single-user demo
- No session sharing — session URLs are single-user

### 9. Session Lifecycle

1. User submits prompt → orchestrator decomposes → task approval screen
2. User approves → backend creates session, spawns workers
3. Workers boot sandboxes, connect via Socket.io, start executing
4. Agents run vision loops, report progress in real time
5. Failed tasks auto-retry once on the same agent
6. Agents finish → sandbox terminated → agent marked terminated
7. All agents done → `session:complete` event → banner shown
8. Sessions persist in memory — survive browser tab close
9. User can reconnect to an active session via session ID
10. Sandboxes auto-terminate after 30 minutes regardless of session state

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui |
| Real-time | Socket.io (frontend ↔ backend ↔ workers) |
| Desktop streaming | E2B built-in streaming (noVNC) |
| Backend API | Next.js API routes + custom server.ts |
| Orchestrator | Dedalus Labs TypeScript SDK (`chat.completions.create`) |
| Agent brain | Dedalus Labs Python SDK (`chat.completions.create`) |
| Computer use tools | E2B Desktop Python SDK |
| Agent processes | Separate Python workers, spawned by backend |
| Agent-backend IPC | Socket.io (workers connect to same server) |
| Cloud sandboxes | E2B Desktop Sandbox (30-min timeout, full internet) |
| Deployment | Local development only |

## Data Flow

1. User types prompt + selects agent count → submits
2. Backend calls Dedalus `chat.completions.create()` to decompose prompt into tasks
3. Frontend shows task approval screen — user can edit tasks and adjust agent count
4. User clicks "Start" → backend creates session, stores tasks, spawns N Python workers
5. Each worker boots an E2B Desktop Sandbox (30-min timeout) → emits `agent:stream_ready`
6. Backend assigns a task to each worker
7. Worker reads whiteboard, then runs the vision loop:
   - Screenshot → inject as image message → LLM reasons → tool call → execute on sandbox → repeat
   - Reasoning + actions streamed to frontend via Socket.io
8. Worker completes task → emits `task:completed` → backend assigns next task (if available)
9. If task fails, backend auto-retries once on the same agent
10. Worker has no more tasks → terminates sandbox → emits `agent:terminated`
11. All workers done → backend emits `session:complete` → frontend shows banner + summary button

## Demo Scenarios

The platform should reliably handle these use cases:

1. **Web research**: Agents browse the web, search Google, read articles, compile findings on the whiteboard
2. **Document creation**: Agents open Google Docs/Sheets, write content, format documents
3. **Multi-step workflow**: Complex task spanning research → document creation → sharing. Agents coordinate via the shared whiteboard.

## Directory Structure

```
/frontend
  /app                     # Next.js App Router pages and layouts
  /app/api                 # API routes (sessions, whiteboard)
  /components              # React components (home, session view, thinking panel, whiteboard)
  /lib                     # Shared utilities (socket, types, session store, worker manager)
  server.ts                # Custom HTTP server with Socket.io
/workers
  worker.py                # Python agent worker (vision loop)
  e2b_tools.py             # E2B Desktop SDK wrappers + tool schemas
  /tools                   # Additional tool modules
  requirements.txt         # Python dependencies
```

## Environment Variables

Required in `frontend/.env.local`:
```
DEDALUS_API_KEY=           # Dedalus Labs SDK (orchestrator + agent workers)
E2B_API_KEY=               # E2B sandbox provisioning
PYTHON_PATH=               # Full path to python3 binary
```
