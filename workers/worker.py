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

SYSTEM_PROMPT = (
    "You are an AI agent controlling a Linux desktop via tools. "
    "You can take screenshots to see the screen, then click, type, or press keys to interact. "
    "Always call take_screenshot first to see what's on screen before acting. "
    "After each action, take another screenshot to verify the result. "
    "When your task is complete, respond with a text summary of what you accomplished — do NOT call any more tools."
)

MODEL = "anthropic/claude-sonnet-4-5-20250929"
MAX_STEPS = 50


async def run_agent_loop(client, messages, on_step=None):
    """
    Custom observe-think-act loop using Dedalus chat.completions.create().

    Screenshots are injected as image_url content blocks so the model
    actually sees the desktop. Other tool results are injected as text.

    Returns the final text response from the model.
    """
    for step in range(MAX_STEPS):
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=e2b_tools.TOOL_SCHEMAS,
        )

        choice = response.choices[0]
        msg = choice.message

        # If the model responded with text and no tool calls, we're done
        if not msg.tool_calls:
            return msg.content or "(no response)"

        # Append the assistant message (with tool_calls) to history
        messages.append(msg.to_dict() if hasattr(msg, "to_dict") else {
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ],
        })

        # Execute each tool call and append results
        for tc in msg.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            if on_step:
                await on_step(step + 1, name, args)

            result = e2b_tools.execute_tool(name, args)

            if name == "take_screenshot":
                # Inject screenshot as an image the model can SEE
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": [
                        {"type": "text", "text": "Here is the current screenshot:"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{result}",
                                "detail": "high",
                            },
                        },
                    ],
                })
            else:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

    return "(max steps reached)"


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
        desktop = Sandbox.create()
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

    # --- Init Daedalus client ---
    client = AsyncDedalus()

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

                async def on_step(step, name, args):
                    logger.info("  Step %d: %s(%s)", step, name, args)
                    await emit("agent:thinking", {
                        "action": f"Tool: {name}",
                        "detail": json.dumps(args),
                    })

                try:
                    messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"Complete this task: {task['description']}"},
                    ]
                    result = await run_agent_loop(client, messages, on_step=on_step)
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
