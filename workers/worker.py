import asyncio
import base64
import json
import logging
import os
import sys
import time
from io import BytesIO

import socketio
from e2b_desktop import Sandbox
from dedalus_labs import AsyncDedalus
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import e2b_tools
from memory import MemoryManager
from replay import ReplayBuffer

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an AI agent controlling a Linux desktop. "
    "You will be shown a screenshot of the current screen before each turn. "
    "Look at the screenshot carefully, then use one of the available tools "
    "(click, double_click, type_text, press_key, move_mouse, scroll) to interact with the desktop. "
    "You can only use ONE tool per turn. After your action, you'll receive a new screenshot.\n\n"
    "IMPORTANT RULES:\n"
    "- If you see a blank desktop, start by opening a web browser (double-click the browser icon, "
    "or right-click the desktop and open a terminal, then run 'firefox' or 'chromium').\n"
    "- You MUST take real actions to accomplish the task. Do NOT call 'done' until you have "
    "actually performed meaningful actions and can see evidence of completion on screen.\n"
    "- Break complex tasks into steps: open the right application, navigate to the right place, "
    "perform the action, and verify the result.\n"
    "- When the task is genuinely complete and you can confirm it from the screenshot, "
    "call the 'done' tool with a detailed summary of what you accomplished."
)

MODEL = "anthropic/claude-sonnet-4-5-20250929"
MAX_STEPS = 500
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds
HISTORY_KEEP_RECENT = 10  # number of recent screenshot/action exchanges to keep verbatim
THUMBNAIL_INTERVAL_SECONDS = 10
MIN_STEPS_BEFORE_DONE = 3  # agent must take at least this many actions before calling done


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


def trim_message_history(messages):
    """Keep system + task messages and only the last N exchanges.

    The message list follows a repeating pattern after the first two entries
    (system, task):
        user (screenshot) -> assistant (tool call) -> tool (result)
    Each group of 3 is one "exchange".  We keep the first 2 messages (system
    prompt + task description) plus the most recent HISTORY_KEEP_RECENT
    exchanges verbatim. Older exchanges are replaced by a single compact
    text summary so the model retains awareness of what it already did
    without the cost of carrying base64 screenshots.
    """
    prefix_len = 2  # system + task
    body = messages[prefix_len:]
    exchange_size = 3  # screenshot msg, assistant msg, tool result msg
    keep_count = HISTORY_KEEP_RECENT * exchange_size

    if len(body) <= keep_count:
        return  # nothing to trim

    old_part = body[: len(body) - keep_count]
    recent_part = body[len(body) - keep_count:]

    # Build a compact summary of old exchanges
    summaries = []
    for msg in old_part:
        role = msg.get("role", "")
        if role == "assistant":
            tool_calls = msg.get("tool_calls") or []
            for tc in tool_calls:
                fn = tc.get("function", {})
                summaries.append(f"- {fn.get('name', '?')}({fn.get('arguments', '')})")
        elif role == "tool":
            content = msg.get("content", "")
            if content:
                summaries.append(f"  -> {content[:120]}")

    summary_text = (
        f"[History summary: you already performed {len(old_part) // exchange_size} "
        f"actions on this task. Recent actions:\n"
        + "\n".join(summaries[-20:])  # keep last 20 summary lines to stay compact
        + "\n]"
    )

    messages[prefix_len:] = [
        {"role": "user", "content": summary_text},
    ] + recent_part


async def run_agent_loop(client, task_description, whiteboard_content="", user_memories="", on_step=None, replay_buffer=None, terminated=None, on_screenshot=None):
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
    if user_memories:
        system_content += f"\n\n{user_memories}"

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": f"Your task: {task_description}"},
    ]

    last_action_label = "Starting task"
    no_tool_retries = 0

    for step in range(MAX_STEPS):
        # Check for termination between steps
        if terminated is not None and terminated.is_set():
            logger.info("Terminated during task at step %d", step)
            return "(terminated by user)"

        # Trim old exchanges to keep context window lean
        trim_message_history(messages)

        # Observe: take screenshot and show it to the model
        screenshot_msg, raw_png = make_screenshot_message()
        messages.append(screenshot_msg)

        # Capture frame for replay
        if replay_buffer is not None:
            replay_buffer.capture_frame(raw_png, last_action_label)

        # Emit thumbnail if callback provided
        if on_screenshot is not None:
            await on_screenshot(raw_png)

        # Exclude the 'done' tool for the first few steps to prevent premature completion
        if step < MIN_STEPS_BEFORE_DONE:
            tools = [t for t in e2b_tools.TOOL_SCHEMAS if t["function"]["name"] != "done"]
        else:
            tools = e2b_tools.TOOL_SCHEMAS

        response = await call_with_retry(
            client,
            model=MODEL,
            messages=messages,
            tools=tools,
            tool_choice={"type": "any"},
            max_tokens=2048,
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
            no_tool_retries += 1
            if no_tool_retries >= 3:
                logger.error("Model returned no tool calls %d times, giving up", no_tool_retries)
                return msg.content or "(model failed to call tools)"
            # Model returned no tool calls despite tool_choice — retry
            # This can happen if the streaming response is incomplete
            logger.warning("No tool calls in response at step %d (retry %d/3)", step, no_tool_retries)
            # Remove the assistant response and screenshot message (will re-add on next iteration)
            messages.pop()  # assistant response
            messages.pop()  # screenshot message
            continue

        # Got a valid tool call — reset retry counter
        no_tool_retries = 0

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
    user_id = os.environ.get("USER_ID")
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
    force_kill = False

    @sio.on("task:assign")
    async def on_task_assign(data):
        await task_queue.put(data)

    @sio.on("task:none")
    async def on_task_none(data=None):
        terminated.set()

    @sio.on("session:stop")
    async def on_session_stop(data=None):
        nonlocal force_kill
        force_kill = True
        terminated.set()

    @sio.on("session:complete")
    async def on_session_complete(data=None):
        terminated.set()

    # --- Boot or reconnect E2B sandbox ---
    desktop = None
    reconnect_sandbox_id = os.environ.get("SANDBOX_ID")
    try:
        if reconnect_sandbox_id:
            logger.info("Reconnecting to sandbox %s", reconnect_sandbox_id)
            desktop = Sandbox(sandbox_id=reconnect_sandbox_id, timeout=3600)
            desktop.stream.start()
            stream_url = desktop.stream.get_url()
            await emit("agent:stream_ready", {"streamUrl": stream_url})
            logger.info("Reconnected to sandbox %s, stream at %s", reconnect_sandbox_id, stream_url)
        else:
            desktop = Sandbox.create(timeout=3600)
            desktop.stream.start()
            stream_url = desktop.stream.get_url()
            await emit("agent:sandbox_ready", {"sandboxId": desktop.sandbox_id})
            await emit("agent:stream_ready", {"streamUrl": stream_url})
            logger.info("Sandbox booted (id=%s), stream at %s", desktop.sandbox_id, stream_url)
    except Exception as e:
        logger.error("Failed to boot/reconnect sandbox: %s", e)
        if reconnect_sandbox_id:
            await emit("agent:sandbox_expired", {})
        else:
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
    _last_thumbnail_time = 0.0

    # --- Memory manager (per-user, opt-in via ENABLE_MEMORY env var) ---
    memory_mgr = MemoryManager() if user_id and os.environ.get("ENABLE_MEMORY") else None

    # --- Heartbeat background task ---
    async def heartbeat_loop():
        while not terminated.is_set():
            try:
                await emit("agent:heartbeat", {"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
            except Exception:
                pass
            await asyncio.sleep(30)

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    # --- Thumbnail generation for Panopticon ---
    thumbnail_task = None

    async def generate_thumbnails():
        """Periodically capture and emit thumbnail screenshots for Panopticon."""
        while not terminated.is_set():
            try:
                # Take screenshot for thumbnail
                raw_bytes = e2b_tools.screenshot_raw_bytes()

                # Create smaller thumbnail (300x200 max)
                img = Image.open(BytesIO(raw_bytes))
                img.thumbnail((300, 200), Image.Resampling.LANCZOS)

                # Convert to JPEG and base64
                thumbnail_buf = BytesIO()
                img.save(thumbnail_buf, format="JPEG", quality=60)
                thumbnail_b64 = base64.b64encode(thumbnail_buf.getvalue()).decode("utf-8")

                # Emit thumbnail update
                await emit("agent:thumbnail", {
                    "thumbnail": thumbnail_b64,
                    "timestamp": int(asyncio.get_event_loop().time() * 1000)
                })

                # Wait 10 seconds before next thumbnail
                await asyncio.sleep(10)

            except Exception as e:
                logger.warning("Failed to generate thumbnail: %s", e)
                await asyncio.sleep(5)  # Shorter delay on error

    # Start thumbnail generation task for Panopticon sessions
    is_panopticon = os.environ.get("PANOPTICON_MODE", "false").lower() == "true"
    if is_panopticon and os.environ.get("ENABLE_THUMBNAILS", "true").lower() == "true":
        thumbnail_task = asyncio.create_task(generate_thumbnails())

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

            # Retrieve user memories for context
            user_memories = ""
            if memory_mgr and user_id:
                user_memories = await asyncio.to_thread(
                    memory_mgr.retrieve_memories, user_id, task_description
                )

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

            async def on_screenshot(raw_png):
                nonlocal _last_thumbnail_time
                now = time.monotonic()
                if now - _last_thumbnail_time >= THUMBNAIL_INTERVAL_SECONDS:
                    _last_thumbnail_time = now
                    try:
                        thumb = ReplayBuffer.make_thumbnail(raw_png)
                        await emit("agent:thumbnail", {"thumbnail": thumb})
                    except Exception as e:
                        logger.warning("Failed to emit thumbnail: %s", e)

            try:
                result = await run_agent_loop(
                    client, task_description,
                    whiteboard_content=whiteboard_content,
                    user_memories=user_memories,
                    on_step=on_step,
                    replay_buffer=replay_buffer,
                    terminated=terminated,
                    on_screenshot=on_screenshot,
                )
            except (ConnectionError, TimeoutError, OSError) as e:
                # E2B sandbox expired or connection lost
                logger.error("Sandbox connection lost during task %s: %s", task_id, e)
                await emit("agent:sandbox_expired", {})
                terminated.set()
                result = f"(sandbox expired: {e})"
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

            # Store memories from successful tasks
            if memory_mgr and user_id and result and not result.startswith("("):
                await asyncio.to_thread(
                    memory_mgr.store_memories, user_id, task_description, result
                )

            # Write result to whiteboard
            await emit(
                "whiteboard:updated",
                {"content": f"## Agent {agent_id[:6]} - Task Complete\n{result}\n\n"},
            )

    finally:
        # Cancel heartbeat
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass

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

        # Decide whether to pause or kill the sandbox
        if desktop:
            if force_kill:
                desktop.kill()
                logger.info("Sandbox killed (user-initiated stop)")
            else:
                try:
                    desktop.pause()
                    await emit("agent:paused", {"sandboxId": desktop.sandbox_id})
                    logger.info("Sandbox paused (id=%s)", desktop.sandbox_id)
                except Exception as e:
                    logger.warning("Failed to pause sandbox, killing instead: %s", e)
                    try:
                        desktop.kill()
                    except Exception:
                        pass
        await emit("agent:terminated", {})
        # Allow queued socket events (replay:complete, agent:terminated) to flush
        await asyncio.sleep(0.5)
        await sio.disconnect()
        logger.info("Worker shut down")


if __name__ == "__main__":
    asyncio.run(main())
