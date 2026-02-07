# Multi-Agent VM Orchestration Platform — Technical Specification

## Overview

A web platform where users submit natural language prompts (e.g., "Write a research paper on Google Docs about the rise of Daedalus Labs"). An orchestrator decomposes the prompt into independent tasks, spawns multiple AI agents each controlling their own cloud desktop sandbox, and streams the live desktop + agent reasoning back to the browser.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ VM Tab 1 │  │ VM Tab 2 │  │ VM Tab 3 │  │ VM Tab 4 │   │
│  │ Desktop  │  │ Desktop  │  │ Desktop  │  │ Desktop  │   │
│  │ Stream   │  │ Stream   │  │ Stream   │  │ Stream   │   │
│  │ +Thinking│  │ +Thinking│  │ +Thinking│  │ +Thinking│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                    Socket.io                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────┴──────────────────────────────────────────┐
│                 Next.js API / Backend                        │
│                                                             │
│  ┌─────────────┐   ┌──────────────────────────────────┐    │
│  │ Orchestrator│   │    In-Memory TODO Whiteboard      │    │
│  │ (Claude API)│──▶│  - Task list with status          │    │
│  │ Decomposes  │   │  - Backend assigns to agents      │    │
│  │ prompt      │   │  - Push model (not pull)          │    │
│  └─────────────┘   └──────────────────────────────────┘    │
│                              │                              │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │ Python    │  │ Python    │  │ Python    │  ...          │
│  │ Worker 1  │  │ Worker 2  │  │ Worker 3  │              │
│  │ (Daedalus)│  │ (Daedalus)│  │ (Daedalus)│              │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘              │
└────────┼───────────────┼───────────────┼────────────────────┘
         │               │               │
┌────────┼───────────────┼───────────────┼────────────────────┐
│  E2B   │               │               │                    │
│  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐             │
│  │ Sandbox 1 │  │ Sandbox 2 │  │ Sandbox 3 │  ...         │
│  │ Linux     │  │ Linux     │  │ Linux     │             │
│  │ Desktop   │  │ Desktop   │  │ Desktop   │             │
│  └───────────┘  └───────────┘  └───────────┘             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend (Next.js App Router + Tailwind + shadcn/ui)

**Home Screen:**
- Single centered input box occupying the middle third of the screen
- Inline controls within the input box to select number of subagents (1–4)
- Submit triggers the orchestration pipeline

**Session View:**
- Tab bar showing one tab per agent/sandbox
- Each tab contains:
  - **Desktop stream**: E2B's built-in desktop streaming, rendered in the browser. Users can click/type directly into the VNC canvas (click-through interaction via noVNC or E2B's stream SDK)
  - **Thinking panel** (sidebar): Structured action log as primary view ("Claimed task X" → "Opening Chrome" → "Typing in search bar") with expandable raw LLM reasoning for each step
- Real-time updates via Socket.io

**Completion:**
- When all agents finish and VMs terminate, show a summary screen: tasks completed, what each agent did, and links to any artifacts produced

### 2. Orchestrator (Backend, LLM-powered)

- Receives the user's prompt
- Makes a Claude API call to decompose the prompt into independent, parallelizable TODOs
- Stores TODOs in an in-memory whiteboard (server-side state)
- Uses a push model: backend assigns tasks to agents as they become available (agents don't choose tasks)
- Can generate additional tasks if needed based on agent progress

### 3. Agent Workers (Separate Python Processes)

- Each agent is a **separate Python process** (not in the Next.js process)
- IPC with the Next.js backend: shared TODO file on disk for coordination
- Each worker:
  1. Receives a task assignment from the backend
  2. Uses **Daedalus Labs SDK** as the agent brain (LLM orchestration + MCP tool calling)
  3. Uses custom **MCP tools wrapping E2B Desktop SDK** (`screenshot()`, `left_click(x,y)`, `write(text)`, `press(key)`) for computer-use actions
  4. Runs an observe → think → act loop: screenshot the sandbox, reason via LLM, execute action, repeat
  5. Reports progress and reasoning back to the backend (streamed to frontend via Socket.io)
- When an agent finishes all assigned tasks and no tasks remain, the agent terminates its E2B sandbox and shuts down

### 4. E2B Desktop Sandboxes

- Each sandbox is a cloud Linux desktop environment
- Provisioned via E2B's API (`e2b-desktop` Python package)
- Desktop streaming via E2B's built-in streaming SDK
- Computer control via E2B Desktop SDK:
  - `sandbox.screenshot()` — capture current screen
  - `sandbox.left_click(x, y)` — click at coordinates
  - `sandbox.double_click(x, y)` — double click
  - `sandbox.write(text)` — type text
  - `sandbox.press(key)` — press special keys
- Sandboxes are terminated when the agent completes its work

### 5. Real-time Communication

- **Socket.io** for all real-time data between frontend and backend
- Namespaces/rooms: one room per session
- Events:
  - `task:created` — new TODO created by orchestrator
  - `task:assigned` — task pushed to an agent
  - `task:completed` — agent finished a task
  - `agent:thinking` — structured action log entry
  - `agent:reasoning` — raw LLM reasoning (expandable in UI)
  - `agent:terminated` — agent finished all work, sandbox destroyed
  - `session:complete` — all agents done, show summary

### 6. API Keys & Auth

- Server-side Claude/LLM API key (we pay for usage)
- E2B API key server-side
- Daedalus Labs API key server-side
- No user authentication for the demo — skip auth entirely

### 7. Session Lifecycle

- Agents keep running even if the user closes the browser tab
- User can reconnect to an existing session and see progress
- Session persistence: in-memory (acceptable for demo scope)

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui |
| Real-time | Socket.io |
| Desktop streaming | E2B built-in streaming SDK |
| Backend API | Next.js API routes |
| Orchestrator LLM | Claude API (via server-side key) |
| Agent brain | Daedalus Labs Python SDK |
| Computer use tools | E2B Desktop Python SDK (wrapped as MCP tools) |
| Agent processes | Separate Python workers |
| Agent-backend IPC | Shared TODO file on disk |
| Cloud sandboxes | E2B Desktop Sandbox |
| Deployment | Local development only (for demo) |

## Data Flow

1. User types prompt + selects agent count → submits
2. Backend receives prompt → Claude API decomposes into TODOs → writes to in-memory whiteboard
3. Backend spawns N Python worker processes
4. Each worker boots an E2B Desktop Sandbox
5. Backend assigns a task to each worker
6. Worker uses Daedalus SDK (with E2B MCP tools) to execute the task:
   - Screenshot → LLM reasons → mouse/keyboard action → repeat
   - Progress streamed back via Socket.io
7. Worker completes task → backend assigns next task (if available)
8. Worker has no more tasks → terminates sandbox → reports done
9. All workers done → backend emits `session:complete` → frontend shows summary
