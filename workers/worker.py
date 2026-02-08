import asyncio
import base64
import json
import logging
import os
import sys
from io import BytesIO

import socketio
from e2b_desktop import Sandbox
from dedalus_labs import AsyncDedalus
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import e2b_tools
from replay import ReplayBuffer

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
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds


def make_screenshot_message():
    """Capture the desktop and return (message_dict, raw_png_bytes)."""
    raw_bytes = e2b_tools.screenshot_raw_bytes()

    # Compress PNG to JPEG for smaller API payloads (~500KB-1MB vs 2-8MB)
    img = Image.open(BytesIO(raw_bytes))
    jpeg_buf = BytesIO()
    img.save(jpeg_buf, format="JPEG", quality=75)
    jpeg_b64 = base64.b64encode(jpeg_buf.getvalue()).decode("utf-8")

    msg = {
        "role": "user",
        "content": [
            {"type": "text", "text": "Here is the current screenshot of the desktop:"},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{jpeg_b64}",
                    "detail": "high",
                },
            },
            {"type": "text", "text": "What action should you take next?"},
        ],
    }
    return msg, raw_bytes  # Still return raw PNG for replay buffer


async def call_with_retry(client, **kwargs):
    """Call client.chat.completions.create() with exponential backoff on failure."""
    for attempt in range(MAX_RETRIES):
        try:
            return await client.chat.completions.create(**kwargs)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning(
                "API error (attempt %d/%d): %s — retrying in %ds",
                attempt + 1, MAX_RETRIES, e, delay,
            )
            await asyncio.sleep(delay)


async def run_agent_loop(client, task_description, whiteboard_content="", on_step=None, replay_buffer=None, terminated=None):
    """
    Observe-think-act loop using Dedalus chat.completions.create().

    Each turn:
      1. Take a screenshot -> inject as a user message (image_url)
      2. Model sees the desktop and returns a tool call
      3. Execute the tool, loop back to 1

    Returns the final summary when the model calls 'done'.
    If `terminated` (asyncio.Event) is set, exits early.
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

    last_action_label = "Starting task"

    for step in range(MAX_STEPS):
        # Check for termination between steps
        if terminated is not None and terminated.is_set():
            logger.info("Terminated during task at step %d", step)
            return "(terminated by user)"

        # Observe: take screenshot and show it to the model
        screenshot_msg, raw_png = make_screenshot_message()
        messages.append(screenshot_msg)

        # Capture frame for replay
        if replay_buffer is not None:
            replay_buffer.capture_frame(raw_png, last_action_label)

        response = await call_with_retry(
            client,
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

        # Extract reasoning from assistant message content (Claude's thinking)
        reasoning = None
        if msg.content:
            if isinstance(msg.content, str):
                reasoning = msg.content.strip() or None
            elif isinstance(msg.content, list):
                text_parts = [
                    block.get("text", "") if isinstance(block, dict) else str(block)
                    for block in msg.content
                    if (isinstance(block, dict) and block.get("type") == "text") or isinstance(block, str)
                ]
                combined = " ".join(text_parts).strip()
                reasoning = combined or None

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
            await on_step(step + 1, name, args, reasoning)

        last_action_label = f"Tool: {name}"

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

    @sio.on("session:complete")
    async def on_session_complete(data=None):
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

    # --- Replay buffer ---
    replay_buffer = ReplayBuffer()
    r2_public_url = os.environ.get("R2_PUBLIC_URL", "")

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

            async def on_step(step, name, args, reasoning=None):
                logger.info("  Step %d: %s(%s)", step, name, args)
                action_id = f"{agent_id}-{step}-{task_id}"
                await emit("agent:thinking", {
                    "action": f"Tool: {name}",
                    "actionId": action_id,
                    "toolName": name,
                    "toolArgs": args,
                })
                if reasoning:
                    await emit("agent:reasoning", {
                        "reasoning": reasoning,
                        "actionId": action_id,
                    })

            try:
                result = await run_agent_loop(
                    client, task_description,
                    whiteboard_content=whiteboard_content,
                    on_step=on_step,
                    replay_buffer=replay_buffer,
                    terminated=terminated,
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
        # Save/upload replay frames before killing sandbox
        if replay_buffer.frame_count > 0:
            try:
                if r2_public_url:
                    # R2 mode: upload via presigned URLs
                    upload_result = await replay_buffer.upload_r2(
                        session_id, agent_id, socket_url, r2_public_url
                    )
                else:
                    # Local mode: save to disk, serve via API route
                    replay_dir = os.environ.get(
                        "REPLAY_DIR",
                        os.path.join(os.path.dirname(__file__), "..", "frontend", ".replays"),
                    )
                    serve_base = f"{socket_url}/api/replay/serve"
                    upload_result = replay_buffer.save_local(
                        session_id, agent_id, replay_dir, serve_base
                    )

                if upload_result:
                    manifest_url, frame_count = upload_result
                    await emit("replay:complete", {
                        "manifestUrl": manifest_url,
                        "frameCount": frame_count,
                    })
                    logger.info("Replay saved: %d frames", frame_count)
            except Exception as e:
                logger.error("Failed to save replay: %s", e)

        if desktop:
            desktop.kill()
        await emit("agent:terminated", {})
        await sio.disconnect()
        logger.info("Worker shut down")


if __name__ == "__main__":
    asyncio.run(main())
