# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-agent VM orchestration platform. Users submit prompts, an orchestrator (Claude API) decomposes them into independent tasks, and multiple AI agents each control their own E2B cloud desktop sandbox to execute tasks in parallel. Live desktop streams and agent reasoning are shown in the browser.

Full specification: `SPEC.md`

## Architecture

**Two-process architecture:**
- **Next.js app** (TypeScript): Frontend + API routes + Socket.io server + orchestrator
- **Python agent workers** (separate processes): Daedalus Labs SDK + E2B Desktop SDK for computer-use

**Key integration points:**
- Next.js backend spawns Python worker processes and communicates via shared TODO file on disk
- Backend pushes task assignments to workers (push model, not pull)
- Workers use Daedalus SDK as the agent brain with custom MCP tools wrapping E2B Desktop SDK
- E2B's built-in streaming SDK handles desktop video; Socket.io handles all other real-time data
- In-memory TODO whiteboard on the backend (no database for MVP)

## Tech Stack

- **Frontend**: Next.js 14+ App Router, Tailwind CSS, shadcn/ui
- **Real-time**: Socket.io (one room per session)
- **Agent brain**: Daedalus Labs Python SDK (`dedalus_labs` pip package)
- **Computer use**: E2B Desktop Python SDK (`e2b-desktop` pip package)
- **Orchestrator**: Dedalus Labs TypeScript SDK (`dedalus-labs` npm package)
- **Desktop streaming**: E2B built-in streaming
- **Deployment**: Local development only

## Common Commands

```bash
# Frontend
npm install              # Install JS dependencies
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run lint             # ESLint

# Python workers
pip install -r requirements.txt   # Install Python deps
python worker.py                  # Start a single agent worker (invoked by backend)
```

## Environment Variables

Required in `.env.local`:
```
DEDALUS_API_KEY=         # Dedalus Labs SDK (orchestrator + agent workers)
E2B_API_KEY=             # E2B sandbox provisioning
```

## Directory Structure Conventions

```
/app                     # Next.js App Router pages and layouts
/app/api                 # API routes (orchestrator, session management)
/components              # React components (home screen, VM tabs, thinking panel)
/lib                     # Shared utilities (socket setup, types, orchestrator logic)
/workers                 # Python agent worker code
/workers/tools           # MCP tool wrappers for E2B Desktop SDK
```

## Key Design Decisions

- **Agents run outside sandboxes**: Daedalus agents run as Python processes on the host, sending computer-use commands to E2B sandboxes remotely (not installed inside VMs)
- **Backend assigns tasks**: Agents don't pull tasks. The backend manages the TODO whiteboard and pushes assignments. This avoids race conditions without distributed locking.
- **Separate Python processes**: Each agent worker is its own Python process for isolation. IPC uses a shared file.
- **Socket.io rooms**: One room per session for scoped real-time events. Events: `task:created`, `task:assigned`, `task:completed`, `agent:thinking`, `agent:reasoning`, `agent:terminated`, `session:complete`
- **No auth for MVP**: API keys are server-side. No user authentication.
- **Session persistence**: Sessions survive browser tab close (agents keep running). Reconnection supported via session ID.

## Agent Computer-Use Loop

Each agent worker follows this cycle:
1. `sandbox.screenshot()` → capture current desktop state
2. Send screenshot to Daedalus/Claude for reasoning
3. Receive action decision (click, type, press key, etc.)
4. Execute action via E2B Desktop SDK (`left_click`, `write`, `press`)
5. Stream thinking + action log to backend via Socket.io
6. Repeat until task is complete
7. Report completion → receive next task or terminate
