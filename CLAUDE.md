# CLAUDE.md

## Project Overview

**Panopticon** — multi-agent VM orchestration platform. Users submit prompts, an orchestrator decomposes them into independent tasks, and multiple AI agents each control their own E2B cloud desktop sandbox in parallel. Live desktop streams and agent reasoning are shown in the browser.

## Architecture

**Two-process architecture:**
- **Next.js app** (`frontend/`): Custom server (`server.ts`) with Socket.io, API routes, orchestrator, auth, billing
- **Python agent workers** (`workers/`): Spawned as child processes by the backend, communicate via Socket.io events

**Layers:**
- **Auth**: NextAuth 5 (beta) with Google OAuth + email/password credentials, JWT sessions, Drizzle adapter
- **Database**: Neon PostgreSQL via Drizzle ORM — persists users, sessions, todos, replays
- **Billing**: Flowglad (`@flowglad/nextjs`) — free tier (2 agents), pro tier (4 agents)
- **Memory**: Mem0 + HuggingFace embeddings + local Qdrant vector store — per-user memory across sessions
- **Real-time**: Socket.io (one room per session) — all IPC between server and workers
- **Replay**: Screenshot capture during agent loops, stored locally or uploaded to R2

**Two worker modes:**
- `worker.py` — manual screenshot-LLM-tool loop using `dedalus_labs` + `e2b_tools`
- `worker_mcp.py` — delegates to `DedalusRunner` with MCP server (`mcp_server.py`) wrapping E2B tools with DAuth

## Tech Stack

- **Framework**: Next.js 16.1.6, React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn/ui, React Compiler (`babel-plugin-react-compiler`)
- **Database**: Drizzle ORM + Neon PostgreSQL (`@neondatabase/serverless`)
- **Auth**: NextAuth 5 beta (`next-auth@5.0.0-beta.30`) + Google OAuth
- **Billing**: Flowglad (`@flowglad/nextjs`)
- **Real-time**: Socket.io 4.8
- **Agent brain**: Dedalus Labs Python SDK (`dedalus_labs`)
- **Computer use**: E2B Desktop Python SDK (`e2b-desktop`)
- **Orchestrator**: Dedalus Labs TS SDK (`dedalus-labs`)
- **Testing**: Vitest

## Directory Structure

```
/frontend                          # Next.js app (all frontend + backend code)
  /app                             # App Router pages and layouts
    /api/auth                      # NextAuth routes
    /api/sessions                  # Session CRUD, approval, history
    /api/flowglad                  # Billing webhook catch-all
    /api/replay                    # Replay upload URLs, serving, mock
    /auth                          # Sign-in / sign-up pages
    /session/[id]                  # Live session view, approval, summary
    /pricing                       # Pricing page
  /components                      # React components
    /ui                            # shadcn/ui primitives
    /kanban                        # Kanban board (task management)
  /lib
    /db                            # Drizzle schema, persistence helpers
      schema.ts                    # Tables: users, accounts, sessions, todos, replays
      session-persist.ts           # Session/todo DB writes
      replay-persist.ts            # Replay DB writes
      index.ts                     # DB client
    orchestrator.ts                # Task decomposition via Dedalus/Claude
    session-store.ts               # In-memory session state
    worker-manager.ts              # Spawns Python worker processes
    types.ts                       # All TypeScript types + Socket.io event contracts
    billing.ts, billing-constants.ts  # Flowglad billing helpers
    socket.ts, socket-client.ts    # Socket.io server/client setup
  auth.ts                          # NextAuth config (Google + Credentials)
  middleware.ts                    # Auth middleware (protects non-public routes)
  server.ts                        # Custom HTTP server (Next.js + Socket.io)
  env.ts                           # Loads .env.local via dotenv

/workers                           # Python agent workers
  worker.py                        # Simple mode: manual loop
  worker_mcp.py                    # MCP mode: DedalusRunner + MCP server
  mcp_server.py                    # MCP server wrapping E2B Desktop tools
  e2b_tools.py                     # E2B tool schemas + execution
  memory.py                        # Mem0 memory manager
  replay.py                        # Screenshot replay buffer
  /tools                           # MCP tool wrappers
```

## Common Commands

```bash
# Frontend (run from /frontend)
cd frontend
npm install                        # Install JS dependencies
npm run dev                        # Start dev server (tsx --import ./env.ts server.ts)
npm run build                      # Production build
npm run lint                       # ESLint
npm run test                       # Vitest

# Python workers (spawned automatically by backend via worker-manager.ts)
pip install -r workers/requirements.txt   # Install Python deps
```

Note: `npm run dev` runs a custom server (`server.ts`) that creates an HTTP server with both Next.js and Socket.io attached — not the default `next dev`.

## Environment Variables

Required in `frontend/.env.local`:
```
DEDALUS_API_KEY=           # Dedalus Labs SDK (orchestrator + agent workers)
E2B_API_KEY=               # E2B sandbox provisioning
DATABASE_URL=              # Neon PostgreSQL connection string
AUTH_GOOGLE_ID=            # Google OAuth client ID
AUTH_GOOGLE_SECRET=        # Google OAuth client secret
AUTH_SECRET=               # NextAuth secret for JWT signing
```

Optional:
```
PYTHON_PATH=               # Path to Python binary (default: python3)
R2_PUBLIC_URL=             # Cloudflare R2 base URL for replay storage
REPLAY_DIR=                # Local replay storage directory (default: frontend/.replays)
MCP_PORT=                  # MCP server port for worker_mcp.py (default: 8765)
FLOWGLAD_SECRET_KEY=       # Flowglad billing API key
```

## Key Constants

- **Agent model**: `anthropic/claude-sonnet-4-5-20250929`
- **Orchestrator model**: `anthropic/claude-sonnet-4-20250514`
- **MAX_STEPS**: 500 (max actions per task in worker.py)
- **HISTORY_KEEP_RECENT**: 10 (recent screenshot/action exchanges kept verbatim; older ones summarized)
- **Screenshot compression**: JPEG quality 75
- **API retries**: Exponential backoff, max 3 attempts (base delay 2s)
- **Billing**: Free = 2 agents, Pro = 4 agents (`PRO_FEATURE_SLUG = "max_agents_4"`)
- **Idle timeout**: 5 minutes after all tasks complete before session finalizes

## Socket.io Events

**Server -> Client (browser):**
`task:created`, `task:assigned`, `task:completed`, `task:assign`, `task:none`, `agent:join`, `agent:thinking`, `agent:reasoning`, `agent:stream_ready`, `agent:error`, `agent:terminated`, `session:complete`, `session:tasks_done`, `whiteboard:updated`, `replay:ready`

**Client -> Server:**
`session:join`, `session:leave`, `session:stop`, `session:finish`, `session:followup`, `agent:join`, `agent:stream_ready`, `agent:thinking`, `agent:reasoning`, `agent:error`, `task:completed`, `agent:terminated`, `whiteboard:updated`, `replay:complete`
