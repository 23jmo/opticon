import asyncio
import json
import logging
import os
import sys

import socketio
from e2b_desktop import Sandbox
from dedalus_labs import AsyncDedalus

sys.path.insert(0, os.path.dirname(__file__))
import e2b_tools

logger = logging.getLogger(__name__)


async def main():
    session_id = os.environ["SESSION_ID"]
    agent_id = os.environ["AGENT_ID"]
    socket_url = os.environ.get("SOCKET_URL", "http://localhost:3000")
    todo_file = os.environ["TODO_FILE"]

    logging.basicConfig(
        level=logging.INFO,
        format=f"[%(levelname)s] agent-{agent_id}: %(message)s",
    )

    # --- Socket.io connection ---
    sio = socketio.AsyncClient()
    await sio.connect(socket_url)
    await sio.emit("agent:join", {"sessionId": session_id, "agentId": agent_id})

    async def emit(event, data):
        await sio.emit(event, {"sessionId": session_id, "agentId": agent_id, **data})

    # --- Boot E2B sandbox ---
    desktop = None
    try:
        desktop = Sandbox()  # E2B_API_KEY read from env automatically
        desktop.stream.start()
        stream_url = desktop.stream.get_url()
        await emit("agent:stream_ready", {"streamUrl": stream_url})
        logger.info("Sandbox booted, stream at %s", stream_url)
    except Exception as e:
        logger.error("Failed to boot sandbox: %s", e)
        await emit("agent:error", {"error": str(e)})
        await sio.disconnect()
        return

    # --- Init tools ---
    e2b_tools.init(desktop)

    # --- Init Daedalus agent ---
    client = AsyncDedalus()  # DEDALUS_API_KEY read from env automatically
    runner = client.agents.get_runner()

    # --- Task loop ---
    try:
        while True:
            tasks = read_todo_file(todo_file)
            if tasks is None:
                await asyncio.sleep(2)
                continue

            my_tasks = [
                t
                for t in tasks
                if t.get("assignedTo") == agent_id and t["status"] == "assigned"
            ]

            if not my_tasks:
                all_done = all(t["status"] == "completed" for t in tasks)
                no_pending = not any(t["status"] == "pending" for t in tasks)
                if all_done or no_pending:
                    break
                await asyncio.sleep(2)
                continue

            for task in my_tasks:
                await emit(
                    "agent:thinking",
                    {"action": "Starting task", "detail": task["description"]},
                )
                logger.info("Starting task %s: %s", task["id"], task["description"])

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
                    result = str(response)
                except Exception as e:
                    result = f"Error: {e}"
                    await emit(
                        "agent:thinking",
                        {"action": "Task failed", "detail": str(e)},
                    )
                    logger.error("Task %s failed: %s", task["id"], e)

                await emit(
                    "task:completed", {"taskId": task["id"], "result": result}
                )
                logger.info("Completed task %s", task["id"])

    finally:
        if desktop:
            desktop.kill()
        await emit("agent:terminated", {})
        await sio.disconnect()
        logger.info("Worker shut down")


def read_todo_file(path):
    """Read tasks from the shared TODO file. Returns None if unavailable."""
    try:
        with open(path, "r") as f:
            return json.load(f)["tasks"]
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None


if __name__ == "__main__":
    asyncio.run(main())
