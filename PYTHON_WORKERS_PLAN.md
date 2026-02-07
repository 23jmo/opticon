# Plan: Python Agent Workers (Steps 2, 11, 12, 13)

## Context

The multi-agent VM orchestration platform needs its Python worker layer. Other team members are building the Next.js frontend, backend API routes, session store, Socket.io server, and worker-manager. This plan covers the Python side: worker processes that receive task assignments, boot E2B desktop sandboxes, and use Daedalus Labs SDK to control desktops via computer-use.

Nothing Python-related exists yet.

---

## Files to Create

| File | Purpose |
|------|---------|
| `requirements.txt` | Python deps (project root) |
| `workers/e2b_tools.py` | 5 E2B Desktop tool functions |
| `workers/worker.py` | Entry point: sandbox lifecycle, Socket.io, task loop, agent execution |

That's it — 3 files. No `__init__.py` (worker.py is invoked directly, not imported as a package). No separate `agent.py` (the Daedalus setup is ~10 lines, inlined in worker.py).

---

## Step 2: requirements.txt

```
dedalus_labs>=0.1.0
e2b-desktop>=1.0.0
python-socketio[asyncio_client]>=5.0.0
python-dotenv>=1.0.0
```

---

## Step 12: E2B Tools (`workers/e2b_tools.py`)

5 tools matching the spec exactly (SPEC.md lines 90-98). No `scroll` or `get_screen_size` — not in spec.

**Design:** Module global `_sandbox` set once via `init(sandbox)`. Tool functions are plain module-level `def`s with type hints + docstrings (Daedalus extracts schemas from these).

**Note on sync vs async:** The E2B Python SDK methods may be synchronous. If so, tool functions will be regular `def` (not `async def`) and we'll wrap them with `asyncio.to_thread()` if needed to avoid blocking the event loop. We'll verify this at implementation time and adjust.

```python
import base64

_sandbox = None

def init(sandbox):
    global _sandbox
    _sandbox = sandbox

def take_screenshot() -> str:
    """Take a screenshot of the current desktop. Returns base64-encoded PNG."""
    img_bytes = _sandbox.screenshot()
    return base64.b64encode(img_bytes).decode("utf-8")

def click(x: int, y: int) -> str:
    """Left-click at screen coordinates (x, y)."""
    _sandbox.left_click(x, y)
    return f"Clicked at ({x}, {y})"

def double_click(x: int, y: int) -> str:
    """Double-click at screen coordinates (x, y)."""
    _sandbox.double_click(x, y)
    return f"Double-clicked at ({x}, {y})"

def type_text(text: str) -> str:
    """Type the given text string."""
    _sandbox.write(text)
    return f"Typed: {text}"

def press_key(key: str) -> str:
    """Press a key or key combo (e.g. 'enter', 'ctrl+c')."""
    _sandbox.press(key)
    return f"Pressed: {key}"

ALL_TOOLS = [take_screenshot, click, double_click, type_text, press_key]
```

---

## Steps 11 + 13: Main Worker (`workers/worker.py`)

Combines the worker entry point AND the Daedalus agent setup (no separate agent.py).

### Env vars (set by worker-manager.ts when spawning):
- `SESSION_ID`, `AGENT_ID`
- `E2B_API_KEY`, `DEDALUS_API_KEY`
- `SOCKET_URL` (default `http://localhost:3000`)
- `TODO_FILE` — path to shared JSON TODO file

### Main flow:
```python
import asyncio, json, os, sys, logging
import socketio
from e2b_desktop import Sandbox
from dedalus_labs import AsyncDedalus

# Add workers dir to path so we can import e2b_tools
sys.path.insert(0, os.path.dirname(__file__))
import e2b_tools

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] agent-%(agent_id)s: %(message)s")

async def main():
    session_id = os.environ["SESSION_ID"]
    agent_id = os.environ["AGENT_ID"]
    socket_url = os.environ.get("SOCKET_URL", "http://localhost:3000")
    todo_file = os.environ["TODO_FILE"]

    # --- Socket.io connection ---
    sio = socketio.AsyncClient()
    await sio.connect(socket_url)
    await sio.emit("agent:join", {"sessionId": session_id, "agentId": agent_id})

    async def emit(event, data):
        await sio.emit(event, {"sessionId": session_id, "agentId": agent_id, **data})

    # --- Boot E2B sandbox ---
    try:
        desktop = Sandbox()  # E2B_API_KEY read from env automatically
        desktop.stream.start()
        stream_url = desktop.stream.get_url()
        await emit("agent:stream_ready", {"streamUrl": stream_url})
    except Exception as e:
        await emit("agent:error", {"error": str(e)})
        await sio.disconnect()
        return

    # --- Init tools ---
    e2b_tools.init(desktop)

    # --- Init Daedalus agent ---
    client = AsyncDedalus()  # DEDALUS_API_KEY read from env automatically
    runner = client.agents.get_runner()
    # NOTE: if get_runner() doesn't exist, try: from dedalus_labs import DedalusRunner; runner = DedalusRunner(client)

    # --- Task loop ---
    try:
        while True:
            tasks = read_todo_file(todo_file)
            if tasks is None:
                await asyncio.sleep(2)
                continue

            my_tasks = [t for t in tasks if t.get("assignedTo") == agent_id and t["status"] == "assigned"]

            if not my_tasks:
                # Check if we should exit
                all_done = all(t["status"] == "completed" for t in tasks)
                no_pending = not any(t["status"] == "pending" for t in tasks)
                if all_done or no_pending:
                    break
                await asyncio.sleep(2)
                continue

            for task in my_tasks:
                await emit("agent:thinking", {"action": "Starting task", "detail": task["description"]})

                try:
                    prompt = (
                        f"You are controlling a Linux desktop to complete this task:\n\n"
                        f"{task['description']}\n\n"
                        f"Use take_screenshot() first to see the screen, then use click, "
                        f"type_text, press_key to interact. Take screenshots between actions "
                        f"to verify results. When done, summarize what you accomplished."
                    )
                    response = await runner.run(
                        input=prompt,
                        tools=e2b_tools.ALL_TOOLS,
                        max_steps=50,
                    )
                    result = str(response)  # or response.final_output if RunResult
                except Exception as e:
                    result = f"Error: {e}"
                    await emit("agent:thinking", {"action": "Task failed", "detail": str(e)})

                await emit("task:completed", {"taskId": task["id"], "result": result})

    finally:
        desktop.kill()
        await emit("agent:terminated", {})
        await sio.disconnect()


def read_todo_file(path):
    """Read tasks from TODO file. Returns None if file doesn't exist yet."""
    try:
        with open(path, "r") as f:
            return json.load(f)["tasks"]
    except (FileNotFoundError, json.JSONDecodeError):
        return None


if __name__ == "__main__":
    asyncio.run(main())
```

### Key design decisions:
- **Workers only READ the TODO file, never write.** Status updates go through Socket.io (`task:completed`). The backend updates its own session store when it receives these events. This eliminates the race condition of multiple processes writing to the same file.
- **No callbacks or step counters.** We emit `agent:thinking` at task start and `task:completed` at task end. Intermediate reasoning depends on what the Daedalus SDK exposes — we'll add streaming if the SDK supports `on_tool_event` or similar, but won't build phantom callback infrastructure.
- **`max_steps=50`** for the Daedalus runner (default is 10, which is too low for computer-use).
- **Error handling:** Sandbox creation failure emits error event and exits gracefully. Task execution failure reports error and moves on. Missing TODO file is handled with a retry loop.
- **SDK APIs are best-effort.** The Daedalus SDK may use `DedalusRunner(client)` instead of `client.agents.get_runner()`, and E2B methods may be sync or async. We'll adjust at implementation time — the structure won't change.

---

## Integration Contract with Other Team Members

### Events the worker emits (backend must handle):

| Event | Payload | When |
|-------|---------|------|
| `agent:join` | `{ sessionId, agentId }` | On connect — backend should join this socket to the session room |
| `agent:stream_ready` | `{ sessionId, agentId, streamUrl }` | After sandbox boots — frontend needs this to embed the desktop stream |
| `agent:thinking` | `{ sessionId, agentId, action, detail }` | Task start / progress |
| `task:completed` | `{ sessionId, agentId, taskId, result }` | Task finished — **backend should update session store** |
| `agent:error` | `{ sessionId, agentId, error }` | Fatal error |
| `agent:terminated` | `{ sessionId, agentId }` | Worker shutting down |

### What the worker needs from the backend:
- `TODO_FILE` written to disk **before** the worker is spawned
- Format: `{ "tasks": [{ "id": "...", "description": "...", "status": "assigned"|"pending"|"completed", "assignedTo": "agent-id"|null }] }`
- Backend can update the file at any time to push new task assignments (worker polls every 2s)
- Socket.io server running at `SOCKET_URL` when worker starts

### Spawn command (for worker-manager.ts):
```
python workers/worker.py
```
With env vars: `SESSION_ID`, `AGENT_ID`, `E2B_API_KEY`, `DEDALUS_API_KEY`, `SOCKET_URL`, `TODO_FILE`

Working directory must be the project root, OR set `PYTHONPATH` to include the `workers/` directory.

---

## Verification

1. `pip install -r requirements.txt` — deps install cleanly
2. Set env vars, run `python workers/worker.py` — connects to Socket.io, boots sandbox
3. Create a test TODO file with one assigned task → worker picks it up, executes, emits `task:completed`
4. Verify E2B tools: screenshot returns base64, click/type/press execute on sandbox
5. Verify graceful shutdown: worker emits `agent:terminated` and kills sandbox
6. Verify error handling: invalid API key → emits `agent:error`, exits cleanly
