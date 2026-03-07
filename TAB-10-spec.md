# TAB-10: Opticon — Slack-Triggered Autonomous Computer-Use Agent

**Linear Issue:** [TAB-10](https://linear.app/tabby-ai/issue/TAB-10/new-vision-for-panopticon)
**Project:** Opticon
**Status:** Backlog
**V1 Success Criteria:** Externally shareable — polished enough to demo publicly, share with beta users, or post on Twitter.

---

## 1. Vision

Opticon is an autonomous agent for computer-use tasks, triggered entirely from Slack. A user mentions `@opticon` in a channel with a task description, the agent asks clarifying questions, spins up one or more cloud desktop sandboxes, executes the task with full desktop capabilities, and reports back with a GIF timelapse of everything it did.

Think: Cursor agents, but for general computer use instead of code editing.

---

## 2. Interaction Model

### 2.1 Invocation
- **Mentions only** — no slash commands. Users type `@opticon <task description>` in any channel where the bot is installed.
- **Channel mentions only** — no DM support. All tasks are visible to the channel, encouraging team adoption and transparency.
- **Follow-ups within the same thread** reference prior task context (e.g., "now email that spreadsheet to John"). Each thread is a continuous conversation with the agent.

### 2.2 Clarification Phase
- **Always clarify first** — even if the task seems clear, Opticon confirms understanding and key assumptions before spinning up a sandbox.
- **Structured UI (Slack Block Kit)** — clarifying questions use buttons, dropdowns, and interactive blocks for quick user responses. No freeform back-and-forth.
- Example flow:
  1. User: `@opticon Export last month's sales data from our Salesforce dashboard as a CSV`
  2. Opticon posts a Block Kit message:
     - "I'll export sales data from Salesforce. A few questions:"
     - **Date range:** `[Feb 1 - Feb 28]` `[Custom...]`
     - **Dashboard:** `[Main Sales Dashboard]` `[Other...]`
     - **Format:** `[CSV]` `[Excel]`
     - `[Start Task]` `[Cancel]`
  3. User taps selections and hits Start Task.

### 2.3 Progress Updates
- **Milestone updates** during execution — brief messages at key moments (e.g., "Opened Salesforce," "Navigating to Reports," "Downloading CSV"). Roughly 3-5 updates per task, not a live stream.
- Updates are posted as replies in the thread to avoid channel noise.

### 2.4 Completion
- **GIF timelapse** posted directly in the Slack thread showing what the agent did.
- **File outputs** (spreadsheets, PDFs, downloads) uploaded directly to the Slack thread.
- **Summary message** describing what was accomplished.

---

## 3. Task Execution

### 3.1 Scope: Full Desktop Tasks
- V1 targets full desktop tasks — browser, native apps (spreadsheets, email clients, file managers), and any GUI application available in the E2B sandbox.
- Not limited to browser-only or developer workflows.

### 3.2 Sandbox Environment
- **E2B Desktop sandboxes** — full cloud desktop with mouse/keyboard control.
- **Full internet access** — no domain restrictions. Agent can browse any site, download files, access web apps.
- **Max duration: 1 hour** — aligned with E2B free tier sandbox limit. Tasks exceeding this are aborted with a partial result.

### 3.3 Auto-Parallelization
- The existing orchestrator decomposes complex tasks into independent sub-tasks when beneficial.
- Each sub-task runs in its own sandbox concurrently.
- Results are **merged into a single consolidated summary** in the thread — one combined GIF (or sequential GIF montage) and one summary message, not per-sub-task replies.

### 3.4 Concurrency
- **Multiple concurrent tasks per user** — each `@opticon` mention spins up independent task(s). No per-user task limits in v1.
- **No rate limiting in v1** — trust the team not to abuse it. Rate limiting deferred to multi-tenant phase.

---

## 4. Safety & Confirmation Gates

### 4.1 Destructive Action Confirmation
- Before executing destructive or irreversible actions (sending emails, deleting files, submitting forms, making purchases), the agent **pauses and asks for confirmation** in the Slack thread.
- Posts a screenshot of the current state + description of the pending action.
- User confirms via Block Kit button: `[Proceed]` `[Cancel]` `[Modify]`

### 4.2 Action Classification
- **LLM-based classification** — Claude evaluates each pending action for destructiveness as part of the agent's reasoning loop. No keyword heuristics or user-defined rules needed.
- Leverages Claude's existing judgment about what constitutes a destructive action (send, delete, submit, pay, post publicly, etc.).

### 4.3 Timeout on Human Input
- When the agent needs user input (stuck, auth handoff, destructive action confirmation), it **waits up to 15 minutes**.
- A reminder is posted at 10 minutes.
- If no response after 15 minutes, the task is aborted with a partial timelapse and summary of progress.

---

## 5. Authentication & Credentials

### 5.1 Layered Auth Model
1. **Primary: Pre-configured OAuth** — Users connect services upfront (Google, Jira, Salesforce, etc.) via OAuth. Agent uses stored tokens to authenticate in the sandbox.
2. **Fallback: Session handoff** — If OAuth isn't available for a service, the agent posts a VNC/stream link. User logs in manually in the browser sandbox, then hands control back to the agent.

### 5.2 OAuth Integration Scope (V1)
- Start with the most common services the team uses. Expand based on demand.
- OAuth tokens stored per-user in the database.

---

## 6. Memory

- **Per-user persistent memory** using the existing Mem0 + Qdrant system.
- Agent remembers user preferences, frequently used services, naming conventions, and task patterns across sessions.
- Examples: "Our Jira board is at X," "Always use the Q1 template for reports," "My manager's email is Y."
- Memory is read at task start and updated post-task.

---

## 7. GIF Timelapse

### 7.1 Capture Strategy
- **Agent action-based keyframes** — a screenshot is captured every time the agent takes an action (click, type, scroll). Reuses the existing replay capture system.
- For tasks up to 1 hour, this produces a variable number of frames depending on task complexity.

### 7.2 GIF Generation
- Frames are compiled into an animated GIF and uploaded directly to the Slack thread.
- Compression strategy needed for longer tasks — consider adaptive frame duration (faster playback for idle periods, slower for action-dense moments).
- **Max GIF size target:** Stay within Slack's file upload limits (currently ~1GB, but aim for <20MB for practical viewing).

### 7.3 Data Retention
- **No special privacy handling** — screenshots and GIFs capture everything visible on the desktop. Users are responsible for what they ask the agent to do.
- No automatic redaction or ephemeral deletion.

---

## 8. Error Recovery

- **Human-in-the-loop** — when the agent gets stuck, it posts a screenshot of the stuck state in the Slack thread and asks the user what to do next.
- Blocks execution until the user responds (subject to 15-minute timeout).
- Agent provides context: what it was trying to do, what went wrong, and what it sees on screen.

---

## 9. Architecture

### 9.1 Deployment
- **Same Next.js monolith** — Slack bot event handling is added to the existing Panopticon custom server (`server.ts`). No separate service.
- Slack events received via Bolt for JavaScript (or raw Events API) integrated into the Express/HTTP server.

### 9.2 Codebase Strategy
- **Reuse everything possible** from the existing Panopticon codebase:
  - `worker.py` / `worker_mcp.py` — agent execution loop
  - `orchestrator.ts` — task decomposition
  - `memory.py` — Mem0 per-user memory
  - `replay.py` — screenshot capture
  - `e2b_tools.py` — sandbox tool schemas
  - `session-store.ts` — in-memory state management
  - `worker-manager.ts` — spawning Python workers
- **New code needed:**
  - Slack Bolt integration (event handling, Block Kit message construction, file uploads)
  - GIF encoding pipeline (frames -> animated GIF)
  - Slack-specific orchestration adapter (maps Slack threads to sessions)
  - OAuth token management for third-party services

### 9.3 Multi-Tenancy Considerations
- **V1 is internal-only** (single workspace), but architect with multi-tenancy in mind:
  - Store workspace ID alongside sessions and user data.
  - Isolate OAuth tokens per workspace.
  - Configuration (connected services, defaults) scoped to workspace.

---

## 10. Data Flow

```
User @mentions @opticon in Slack channel
        |
        v
Slack Events API -> Next.js server (Bolt handler)
        |
        v
Parse task description, create session in DB
        |
        v
Post Block Kit clarification questions in thread
        |
        v
User responds via button interactions
        |
        v
Orchestrator decomposes task into sub-tasks
        |
        v
Worker Manager spawns Python worker(s) with E2B sandbox(es)
        |
        v
Workers execute tasks (screenshot-LLM-action loop)
   |-- Milestone updates posted to Slack thread
   |-- Destructive actions trigger confirmation in thread
   |-- Stuck states trigger help request in thread
        |
        v
Task complete: compile action screenshots into GIF
        |
        v
Upload GIF + output files to Slack thread
Post summary message
Update Mem0 with learned context
```

---

## 11. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Interaction surface | Slack only | No web UI needed. Reduces scope. Meets users where they are. |
| Invocation | @mention only | Natural, conversational. No slash commands to remember. |
| Clarification | Always, structured | Reduces errors. Block Kit is fast to respond to. |
| Task parallelism | Auto-decompose | Leverages existing orchestrator. Faster for complex tasks. |
| Auth model | OAuth + session handoff | Covers most cases securely. Handoff as escape hatch. |
| Destructive action detection | Claude LLM judgment | No brittle heuristics. Model already understands risk. |
| Memory | Persistent per-user (Mem0) | Agent improves over time. Already built. |
| Timelapse format | GIF in Slack | Zero-friction viewing. No external links needed. |
| Progress updates | Milestone-based | Informative without being noisy. |
| Error handling | Ask user in-thread | Keeps human in the loop. 15min timeout prevents zombie sandboxes. |
| Deployment | Same Next.js server | Monolith simplicity. One deploy target. |
| Multi-tenancy | Architected for, not implemented | Internal-first but won't paint ourselves into a corner. |

---

## 12. Open Questions / Future Considerations

- **GIF size optimization:** For 1-hour tasks with hundreds of action frames, how aggressively to compress? May need to cap frame count or switch to video for very long tasks.
- **OAuth integrations:** Which services to support first? Likely Google Workspace, then expand based on team usage.
- **Slack file size limits:** If GIFs exceed Slack limits, fallback strategy needed (cloud link? lower resolution?).
- **Thread context window:** For long follow-up chains, how much thread history to feed the agent? May need summarization.
- **Sub-task result merging:** How to create a coherent single GIF from multiple parallel sandbox recordings? Stitch sequentially? Side-by-side? Highlight reel?
- **Sandbox pre-warming:** For faster response times, consider keeping warm sandboxes ready.
- **Billing for multi-tenant:** Per-task pricing? Subscription tiers? Credits system?
