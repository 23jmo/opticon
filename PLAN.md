# Implementation Plan: Multi-Agent VM Orchestration Platform

## Phase 1: Project Scaffolding

1. **Initialize Next.js project** with App Router, Tailwind CSS, TypeScript
   - `npx create-next-app@latest . --typescript --tailwind --app --eslint`
   - Install shadcn/ui: `npx shadcn@latest init`
   - Install Socket.io: `npm install socket.io socket.io-client`

2. **Set up Python worker environment**
   - Create `/workers` directory
   - Create `requirements.txt` with `dedalus_labs`, `e2b-desktop`, `python-socketio`
   - Create basic worker entry point

3. **Create `.env.local` template** with required keys (ANTHROPIC_API_KEY, E2B_API_KEY, DEDALUS_API_KEY)

## Phase 2: Frontend — Home Screen

4. **Build home page** (`/app/page.tsx`)
   - Centered input box (middle 1/3 of screen)
   - Agent count selector (1-4) as inline control within the input box
   - Submit button / Enter key handling
   - POST to `/api/sessions` on submit

5. **Install shadcn components** needed: Button, Input, Slider or Select, Card, Tabs, Badge

## Phase 3: Backend — Orchestrator & Session Management

6. **Create session API route** (`/app/api/sessions/route.ts`)
   - POST: receive prompt + agent count
   - Call Claude API to decompose prompt into independent TODOs
   - Create in-memory session object with TODO whiteboard
   - Return session ID

7. **Create in-memory session store** (`/lib/session-store.ts`)
   - Map of session ID -> { prompt, todos, agents, status }
   - TODO structure: { id, description, status: 'pending' | 'assigned' | 'completed', assignedTo }
   - Task assignment logic (push model)

8. **Set up Socket.io server** (`/lib/socket.ts` or custom server)
   - Note: Next.js App Router doesn't natively support WebSockets. Use a custom server (`server.ts`) that wraps Next.js + Socket.io.
   - Room per session
   - Define all events: task:created, task:assigned, task:completed, agent:thinking, agent:reasoning, agent:terminated, session:complete

## Phase 4: Backend — Agent Worker Management

9. **Create worker spawner** (`/lib/worker-manager.ts`)
   - Spawn Python child processes (`child_process.spawn`)
   - Pass session ID, agent ID, E2B/Daedalus API keys as env vars
   - Write TODO file to shared location for IPC
   - Monitor worker stdout/stderr for status updates

10. **Create shared TODO file format** (`/lib/todo-file.ts`)
    - JSON file at a known path per session
    - Backend writes tasks, workers read assignments
    - Simple file-based IPC

## Phase 5: Python Agent Worker

11. **Create main worker script** (`/workers/worker.py`)
    - Read config from env vars (session ID, agent ID, API keys)
    - Boot E2B Desktop Sandbox
    - Connect to backend Socket.io for progress reporting
    - Enter agent loop: receive task -> execute -> report -> next task

12. **Create E2B MCP tools** (`/workers/tools/e2b_tools.py`)
    - Wrap E2B Desktop SDK as MCP tools for Daedalus:
      - `screenshot` -> `sandbox.screenshot()`
      - `click` -> `sandbox.left_click(x, y)`
      - `type_text` -> `sandbox.write(text)`
      - `press_key` -> `sandbox.press(key)`
      - `double_click` -> `sandbox.double_click(x, y)`

13. **Create Daedalus agent setup** (`/workers/agent.py`)
    - Initialize Daedalus client with MCP tools
    - Computer-use loop: screenshot -> reason -> act -> repeat
    - Stream thinking (structured actions + raw reasoning) back via Socket.io

## Phase 6: Frontend — Session View

14. **Create session page** (`/app/session/[id]/page.tsx`)
    - Connect to Socket.io room for this session
    - Tab bar with one tab per agent

15. **Build VM tab component** (`/components/vm-tab.tsx`)
    - Desktop stream viewer (E2B streaming SDK embed / iframe)
    - Click-through interaction (mouse/keyboard forwarded to sandbox)

16. **Build thinking panel** (`/components/thinking-panel.tsx`)
    - Structured action log (primary view)
    - Expandable raw LLM reasoning per step
    - Auto-scroll as new entries arrive

17. **Build summary screen** (`/components/session-summary.tsx`)
    - Shown when all agents terminate
    - List of completed tasks per agent
    - Artifacts if any

## Phase 7: Integration & Polish

18. **Wire everything end-to-end**
    - Home -> submit -> session created -> redirect to session page
    - Session page connects Socket.io -> shows agent tabs populating
    - Desktop streams appear -> thinking panel updates in real-time
    - Tasks complete -> agents terminate -> summary shown

19. **Handle reconnection**
    - Session page checks if session exists on mount
    - If agents are still running, reconnect to Socket.io room and resume streaming

## Verification

1. Start the dev server and Python environment
2. Submit a prompt with 2 agents on the home screen
3. Verify orchestrator decomposes prompt into multiple TODOs
4. Verify 2 E2B sandboxes are created and streaming
5. Verify agent thinking appears in the sidebar panels
6. Verify click-through interaction works on the desktop stream
7. Verify agents complete tasks and the summary screen appears
8. Close browser tab, reopen session URL — verify reconnection works

## Files to Create

| File | Purpose |
|------|---------|
| `app/page.tsx` | Home screen with prompt input |
| `app/session/[id]/page.tsx` | Session view with VM tabs |
| `app/api/sessions/route.ts` | Session creation API |
| `app/api/sessions/[id]/route.ts` | Session status API |
| `components/prompt-input.tsx` | Home screen input component |
| `components/vm-tab.tsx` | Desktop stream + interaction |
| `components/thinking-panel.tsx` | Agent reasoning sidebar |
| `components/session-summary.tsx` | Completion summary |
| `lib/session-store.ts` | In-memory session/TODO state |
| `lib/socket.ts` | Socket.io setup |
| `lib/worker-manager.ts` | Python process spawner |
| `lib/todo-file.ts` | Shared file IPC |
| `server.ts` | Custom server (Next.js + Socket.io) |
| `workers/worker.py` | Agent worker entry point |
| `workers/agent.py` | Daedalus agent loop |
| `workers/tools/e2b_tools.py` | MCP tools wrapping E2B SDK |
| `requirements.txt` | Python dependencies |
