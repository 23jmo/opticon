"""Agent worker process.

Spawned by the Node.js backend (worker-manager.ts). Communicates over
stdin/stdout using newline-delimited JSON messages.

Protocol
--------
stdout → backend:
    {"type": "sandbox_ready", "sandboxId": "...", "streamUrl": "..."}
    {"type": "log", "action": "...", "reasoning": "..."}
    {"type": "complete", "todoId": "...", "result": "..."}

stdin ← backend:
    {"taskId": "...", "description": "..."}
"""

import asyncio
import json
import os
import sys

from dedalus_labs import AsyncDedalus, DedalusRunner
from e2b_desktop import Sandbox

from tools.e2b_tools import create_tools

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def emit(message: dict) -> None:
    """Write a JSON line to stdout for the Node.js backend."""
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def emit_log(action: str, reasoning: str) -> None:
    """Convenience wrapper used by tool functions."""
    emit({"type": "log", "action": action, "reasoning": reasoning})


def read_stdin_line() -> str | None:
    """Read one line from stdin (blocking). Returns None on EOF."""
    try:
        line = sys.stdin.readline()
        if not line:
            return None
        return line.strip()
    except EOFError:
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    session_id = os.environ.get("SESSION_ID", "")
    agent_id = os.environ.get("AGENT_ID", "")
    task_id = os.environ.get("TASK_ID", "")
    task_description = os.environ.get("TASK_DESCRIPTION", "")
    e2b_api_key = os.environ.get("E2B_API_KEY", "")
    dedalus_api_key = os.environ.get("DEDALUS_API_KEY", "")

    if not e2b_api_key or not dedalus_api_key:
        print("ERROR: E2B_API_KEY and DEDALUS_API_KEY are required", file=sys.stderr)
        sys.exit(1)

    # 1. Create E2B Desktop Sandbox
    emit_log("booting", "Creating E2B Desktop sandbox...")
    sandbox = Sandbox.create(api_key=e2b_api_key)

    sandbox_id = sandbox.sandbox_id
    stream_url = sandbox.stream.get_url() if hasattr(sandbox, "stream") else ""

    emit({
        "type": "sandbox_ready",
        "sandboxId": sandbox_id,
        "streamUrl": stream_url,
    })

    # 2. Create tool functions bound to this sandbox
    tools = create_tools(sandbox, emit_log)

    # 3. Create Dedalus client + runner
    client = AsyncDedalus(api_key=dedalus_api_key)
    runner = DedalusRunner(client)

    # 4. Run the initial task
    current_task_id = task_id
    current_description = task_description

    while True:
        emit_log("running", f"Starting task: {current_description[:120]}")

        try:
            result = await runner.run(
                input=current_description,
                model="anthropic/claude-sonnet-4-5-20250929",
                tools=tools,
                max_steps=30,
            )
            final_output = result.final_output if hasattr(result, "final_output") else str(result)
        except Exception as exc:
            final_output = f"Error: {exc}"
            print(f"[worker:{agent_id}] Task failed: {exc}", file=sys.stderr)

        # 5. Report completion
        emit({
            "type": "complete",
            "todoId": current_task_id,
            "result": final_output,
        })

        # 6. Wait for next task from stdin
        raw = read_stdin_line()
        if raw is None:
            break

        try:
            next_task = json.loads(raw)
            current_task_id = next_task["taskId"]
            current_description = next_task["description"]
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"[worker:{agent_id}] Bad task payload: {exc}", file=sys.stderr)
            break

    # 7. Clean up
    emit_log("cleanup", "Shutting down sandbox...")
    try:
        sandbox.kill()
    except Exception:
        pass


if __name__ == "__main__":
    asyncio.run(main())
