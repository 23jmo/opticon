## Inspiration

Stories about prompt injection attacks and security breaches in AI tools like Openclaw made us realize how dangerous it is to give agents direct access to users' machines. At the same time, we've been following the rise of orchestrated agent swarms tackling real-world workflows — research, document creation, data analysis — and we've always been interested in multi-agent orchestration and simulating human behavior with AI.

The logical next step was obvious: give each agent access to its own **secure, sandboxed computing environment** via cloud VMs and run them in parallel. No access to your files. No black box. Full visibility into every click, keystroke, and reasoning step.

The name Panopticon reflects this: total visibility over autonomous agents, giving users the confidence to delegate complex, multi-step tasks without sacrificing oversight or security.

## What it does

**Panopticon** is a multi-agent orchestration platform. Users submit a natural language prompt (e.g., *"Research the top 5 AI frameworks and create a comparison spreadsheet"*), and our orchestrator automatically decomposes it into independent, parallelizable tasks.

The user reviews and approves the task breakdown, then multiple AI agents each boot their own cloud Linux desktop and execute their assigned tasks simultaneously.

The browser shows:

- **Live desktop streams** for each agent — you watch them browse the web, open documents, type, and click in real time
- A **thinking sidebar** that streams each agent's reasoning and tool calls as they work
- A **shared whiteboard** where agents post findings and coordinate with each other
- **Task progress tracking** per agent with status indicators
- **Follow-up instructions** — after agents finish, you can send new prompts without rebooting sandboxes

When all agents finish, you get a complete summary and recorded session timelapses.

Each agent runs a vision-based **observe → think → act** loop: screenshot the desktop, send it to an LLM that can see the image, receive a mouse/keyboard action, execute it, repeat.

## How we built it

**Frontend:** Next.js 16 with App Router, Tailwind CSS, and shadcn/ui for a polished dark-themed UI with cyan/teal accents. Socket.io handles all real-time communication between the browser and backend.

**Backend:** A custom Next.js server (`server.ts`) with Socket.io integration. The orchestrator uses the Dedalus Labs TypeScript SDK with K2 Think to decompose prompts into tasks — K2 Think's advanced reasoning cleanly breaks complex prompts into structured independent actions for every agent.

**Agent workers:** Each agent is a separate Python process spawned by the backend. Workers use the Dedalus Labs Python SDK as the "brain" and the E2B Desktop SDK for computer control.

**The vision loop:**
1. Takes a screenshot via E2B Desktop SDK → encodes to base64
2. Injects it as a user message with `image_url` content block (so the model actually *sees* the desktop)
3. The model returns a tool call — `click(x, y)`, `type_text("hello")`, `press_key("enter")`, etc.
4. The worker executes the action on the E2B sandbox
5. Emits thinking/reasoning events over Socket.io to the frontend
6. Loops back to step 1

**Cloud sandboxes:** E2B Desktop Sandboxes provide isolated Linux desktops with full internet access, 30-minute timeouts, and built-in noVNC streaming. Critically, agents run *outside* the sandboxes — they send commands remotely, so credentials and agent code are never exposed to potentially malicious content inside the VM.

**Auth & billing:** NextAuth for Google sign-in, Neon PostgreSQL via Drizzle ORM for persistence, and Flowglad for subscription billing.

**Key technologies:**
- **K2 Think** for core LLM orchestration using advanced reasoning to break down tasks
- **E2B Desktop SDK** for cloud Linux sandboxes with built-in streaming
- **Dedalus Labs API** for spawning subagents (provider-agnostic gateway)
- **Socket.io** for all real-time communication (frontend ↔ backend ↔ Python workers)
- **Next.js 16 App Router** with Tailwind CSS and shadcn/ui
- **Neon PostgreSQL** for session persistence via Drizzle ORM
- **Flowglad** for billing and subscription management
- **NextAuth** with Google OAuth for authentication

## Challenges we ran into

**Getting the agent to actually *see*.** Our first approach used the Dedalus `DedalusRunner` high-level agent loop, which stringifies all tool results. Screenshots came back as raw base64 text — the model couldn't interpret them visually. The agent would take one screenshot, dump the base64, and immediately give up. We had to drop down to `chat.completions.create()` directly and build a custom agentic loop where screenshots are injected as `image_url` content blocks in user messages in order for the images to actually render.

**Finding a good orchestrator.** We initially started with GPT 4.1 for task decomposition, but it was lackluster at breaking complex prompts into truly independent subtasks — agents had to wait serially for others to complete before starting their own work. We pivoted to K2 Think for its advanced reasoning capabilities, and it cleanly decomposes tasks into structured independent actions for every agent.

**Environment variable loading.** Our custom `server.ts` runs via `tsx`, which doesn't auto-load `.env.local` like `next dev` does. Database connections failed at import time because env vars weren't available yet. We solved this with a `--import` preload script.

**LLM output parsing.** Getting the orchestrator to return only valid JSON was unreliable — models would wrap responses in conversational text or malformed markdown. We built a robust JSON extractor that walks the response string to find balanced braces, handling cases where the model includes reasoning text around the JSON.

**Real-time architecture.** Coordinating Socket.io events between the browser, the Next.js backend, and multiple Python worker processes — each in their own room — required careful event routing and state management to avoid race conditions.

## Accomplishments that we're proud of

- **It actually works end-to-end.** You type a prompt, agents boot real cloud desktops, open browsers, navigate the web, and complete tasks — all streamed live to your browser with reasoning visible in real time.
- **The vision loop architecture.** Building a custom observe-think-act loop that sends screenshots as actual images through the Dedalus API was non-obvious and required deep research into how the SDK handles tool results vs. user messages.
- **Real-time everything.** Socket.io connects the browser, the Node.js backend, and multiple Python worker processes. Agent thinking, tool calls, task assignments, whiteboard updates, and desktop streams all flow in real time.
- **Session replay.** At the end of a session, we save recordings of the VMs as timelapses so you can scrub through what each agent did after the fact.
- **Secure by design.** Agents run on the host but operate inside isolated cloud sandboxes. API keys and credentials never enter the VM, so even if an agent visits a malicious website, it can't compromise the system.
- **Human-in-the-loop.** Users review and approve task decompositions before any agent boots up. You see exactly what each agent will attempt and can edit the plan.

## What we learned

- **LLM tool-result formats matter more than you'd think.** The difference between "tool result as text" and "user message as image" is the difference between a blind agent and a sighted one. Always check how your SDK serializes tool outputs.
- **Provider-agnostic SDKs have tradeoffs.** Dedalus gives us flexibility to swap between Claude, K2 Think, and other models, but it also means we can't use provider-specific features like Anthropic's native `computer_use` tool type — a capability we had to build ourselves.
- **Multi-agent coordination is hard.** Even with a shared whiteboard, getting agents to meaningfully build on each other's work requires careful prompt engineering and coordination design.
- **Multi-runtime architectures (TypeScript + Python) add real complexity.** Every integration point — env vars, process spawning, socket communication — is a potential failure mode.
- **E2B's cloud desktop sandboxes are a powerful primitive.** The ability to give an AI agent a full Linux desktop with internet access — while keeping it completely isolated — unlocks use cases that local execution can't safely support.

## What's next for Panopticon

- **Agent-to-agent communication.** Beyond the shared whiteboard, agents should be able to directly hand off URLs, file paths, credentials, etc. to each other.
- **Smarter orchestration.** Dynamic re-planning mid-session — if an agent discovers something that changes the task breakdown, the orchestrator should adapt.
- **Improved recovery.** Right now when an agent goes down, it's hard to recover. We want robust reconnect logic and sandbox checkpointing.
- **Collaborative editing.** Let users interact with agent desktops in real time, not just observe.
- **Deployment.** Currently local-only. Next step is a hosted deployment with proper rate limiting and sandbox pooling for faster boot times.
