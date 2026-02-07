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
    "You are an AI agent controlling a Linux desktop. "
    "You will be shown a screenshot of the current screen before each turn. "
    "Look at the screenshot carefully, then use one of the available tools "
    "(click, double_click, type_text, press_key, move_mouse, scroll) to interact with the desktop. "
    "You can only use ONE tool per turn. After your action, you'll receive a new screenshot. "
    "When the task is complete, call the 'done' tool with a summary."
)

MODEL = "anthropic/claude-sonnet-4-5-20250929"
MAX_STEPS = 500


def make_screenshot_message():
    """Capture the desktop and return a user message with the image."""
    b64 = e2b_tools.screenshot_as_base64()
    return {
        "role": "user",
        "content": [
            {"type": "text", "text": "Here is the current screenshot of the desktop:"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{b64}",
                    "detail": "high",
                },
            },
            {"type": "text", "text": "What action should you take next?"},
        ],
    }


async def run_agent_loop(client, task_description, whiteboard_content="", on_step=None):
    """
    Observe-think-act loop using Dedalus chat.completions.create().

    Each turn:
      1. Take a screenshot -> inject as a user message (image_url)
      2. Model sees the desktop and returns a tool call
      3. Execute the tool, loop back to 1

    Returns the final summary when the model calls 'done'.
    """
    system_content = SYSTEM_PROMPT
    if whiteboard_content:
        system_content += (
            f"\n\nShared whiteboard (written by other agents):\n{whiteboard_content}"
        )

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"Your task: {task_description}"},
    ]

    for step in range(MAX_STEPS):
        # Observe: take screenshot and show it to the model
        messages.append(make_screenshot_message())

        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=e2b_tools.TOOL_SCHEMAS,
            tool_choice={"type": "any"},
        )

        choice = response.choices[0]
        msg = choice.message

        # Append assistant response to history
        messages.append(msg.to_dict() if hasattr(msg, "to_dict") else {
            "role": "assistant",
            "content": msg.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in (msg.tool_calls or [])
            ],
        })

        if not msg.tool_calls:
            return msg.content or "(no response)"

        # Execute the first tool call (one action per turn)
        tc = msg.tool_calls[0]
        name = tc.function.name
        try:
            args = json.loads(tc.function.arguments)
        except json.JSONDecodeError:
            args = {}

        if on_step:
            await on_step(step + 1, name, args)

        result = e2b_tools.execute_tool(name, args)

        # If done, return the summary
        if name == "done":
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            return result

        # Append tool result and continue
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    return "(max steps reached)"


async def main():
    session_id = os.environ["SESSION_ID"]
    agent_id = os.environ["AGENT_ID"]
    socket_url = os.environ.get("SOCKET_URL", "http://localhost:3000")

    logging.basicConfig(
        level=logging.INFO,
        format=f"[%(levelname)s] agent-{agent_id}: %(message)s",
    )

    # --- Socket.io connection ---
    sio = socketio.AsyncClient()
    await sio.connect(socket_url)

    async def emit(event, data):
        await sio.emit(event, {"sessionId": session_id, "agentId": agent_id, **data})

    # Join session room
    await emit("agent:join", {})

    # --- Register event handlers BEFORE booting sandbox ---
    task_queue = asyncio.Queue()
    terminated = asyncio.Event()

    @sio.on("task:assign")
    async def on_task_assign(data):
        await task_queue.put(data)

    @sio.on("task:none")
    async def on_task_none(data=None):
        terminated.set()

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

    try:
        while not terminated.is_set():
            # Wait for a task or termination signal
            try:
                task_data = await asyncio.wait_for(task_queue.get(), timeout=2.0)
            except asyncio.TimeoutError:
                if terminated.is_set():
                    break
                continue

            task_id = task_data["taskId"]
            task_description = task_data["description"]
            whiteboard_content = task_data.get("whiteboard", "")

            await emit(
                "agent:thinking",
                {"action": "Starting task", "detail": task_description},
            )
            logger.info("Starting task %s: %s", task_id, task_description)

            async def on_step(step, name, args):
                logger.info("  Step %d: %s(%s)", step, name, args)
                await emit("agent:thinking", {
                    "action": f"Tool: {name}",
                    "detail": json.dumps(args),
                })

            try:
                result = await run_agent_loop(
                    client, task_description,
                    whiteboard_content=whiteboard_content,
                    on_step=on_step,
                )
            except Exception as e:
                result = f"Error: {e}"
                await emit(
                    "agent:error",
                    {"error": str(e)},
                )
                logger.error("Task %s failed: %s", task_id, e)

            # Report task completion
            await emit(
                "task:completed", {"todoId": task_id, "result": result}
            )
            logger.info("Completed task %s", task_id)

            # Write result to whiteboard
            await emit(
                "whiteboard:updated",
                {"content": f"## Agent {agent_id[:6]} - Task Complete\n{result}\n\n"},
            )

    finally:
        if desktop:
            desktop.kill()
        await emit("agent:terminated", {})
        await sio.disconnect()
        logger.info("Worker shut down")


if __name__ == "__main__":
    asyncio.run(main())
