# Opticon

Multi-agent orchestration platform where AI agents each control their own cloud Linux desktop to execute tasks in parallel. Submit a prompt, review the task breakdown, then watch agents work in real time.

## How It Works

1. **Submit a prompt** — e.g. *"Research the top 5 AI frameworks and create a comparison spreadsheet"*
2. **Review tasks** — the orchestrator decomposes the prompt into independent subtasks via a kanban board
3. **Watch agents work** — each agent boots a cloud Linux desktop and executes its task with full visibility
4. **See results** — live desktop streams, reasoning sidebar, shared whiteboard, and session replays

Each agent runs a vision-based **observe-think-act** loop: screenshot the desktop, send it to an LLM, receive a mouse/keyboard action, execute it, repeat.

## Architecture

```
Browser (Next.js)  ←Socket.io→  Backend (Node.js)  ←Socket.io→  Python Workers
                                      │                              │
                                      │                         Dedalus Labs SDK
                                      │                         (agent brain)
                                      │                              │
                                 Orchestrator                   E2B Desktop SDK
                                 (Dedalus K2 Think)             (computer control)
                                                                     │
                                                              E2B Cloud Sandboxes
                                                              (isolated Linux VMs)
```

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui
- **Real-time**: Socket.io (browser ↔ backend ↔ workers)
- **Orchestrator**: Dedalus Labs TypeScript SDK (K2 Think for task decomposition)
- **Agent brain**: Dedalus Labs Python SDK (vision loop with tool calling)
- **Computer use**: E2B Desktop SDK (cloud Linux sandboxes with noVNC streaming)
- **Auth**: NextAuth with Google OAuth
- **Database**: Neon PostgreSQL via Drizzle ORM
- **Billing**: Flowglad

## Project Structure

```
/frontend
  /app                  Next.js App Router pages and API routes
  /components           React components (agent grid, thinking sidebar, kanban board)
  /lib                  Shared utilities, types, socket setup, session store
  server.ts             Custom HTTP server with Socket.io
/workers
  worker.py             Python agent worker (vision loop)
  e2b_tools.py          E2B Desktop SDK tool wrappers
  replay.py             Session replay/timelapse recording
  /tools                Additional tool modules
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- API keys for Dedalus Labs and E2B

### Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Python workers
pip install -r requirements.txt
```

### Environment Variables

Create `frontend/.env.local`:

```env
DEDALUS_API_KEY=         # Dedalus Labs SDK (orchestrator + agent workers)
E2B_API_KEY=             # E2B sandbox provisioning
PYTHON_PATH=             # Full path to python3 binary
```

### Run

```bash
cd frontend
npm run dev
```

This starts the Next.js dev server with Socket.io. The backend spawns Python worker processes automatically when a session starts.

## Key Design Decisions

- **Agents run outside sandboxes** — Python workers send commands to E2B VMs remotely. API keys and agent code are never exposed to content inside the VM.
- **Push-based task assignment** — The backend assigns tasks to agents (agents don't pull). Avoids race conditions without distributed locking.
- **Vision-based computer use** — Screenshots are injected as actual images into the LLM conversation, not as base64 text in tool results. This is critical for the model to actually "see" the desktop.
- **Session persistence** — Sessions survive browser tab close. Agents keep running and you can reconnect via session ID.

## License

MIT
