"""
End-to-end test: spin up an E2B sandbox, run the vision-based agentic
loop to open Firefox. Screenshots are sent as user messages (image_url)
so the model actually sees the desktop. Tool calls printed live.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

sys.path.insert(0, os.path.dirname(__file__))

from e2b_desktop import Sandbox
from dedalus_labs import AsyncDedalus
import e2b_tools

SYSTEM_PROMPT = (
    "You are an AI agent controlling a Linux desktop. "
    "You will be shown a screenshot of the current screen before each turn. "
    "Look at the screenshot carefully, then use one of the available tools "
    "(click, double_click, type_text, press_key, move_mouse) to interact with the desktop. "
    "You can only use ONE tool per turn. After your action, you'll receive a new screenshot. "
    "When the task is complete, call the 'done' tool with a summary."
)

MODEL = "anthropic/claude-sonnet-4-5-20250929"
MAX_STEPS = 30
STEP_COUNT = 0


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


async def main():
    global STEP_COUNT

    # --- Boot sandbox ---
    print("Booting E2B desktop sandbox...")
    desktop = Sandbox.create(timeout=180)
    print(f"Sandbox ID: {desktop.sandbox_id}")
    desktop.wait(3000)

    # --- Wire up tools ---
    e2b_tools.init(desktop)

    # --- Create Daedalus client ---
    print("Initializing Dedalus client...")
    client = AsyncDedalus()

    # --- Build initial messages ---
    task = "Open the Firefox web browser on this Linux desktop, then search google.com in the web browser and then stop."
    print(f"\nTask: {task}")
    print("Running vision-based agent loop:\n" + "-" * 60)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Your task: {task}"},
    ]

    # --- Observe-think-act loop ---
    for step in range(MAX_STEPS):
        # 1. Observe: screenshot → user message
        print(f"\n  [Step {step + 1}] Taking screenshot...")
        messages.append(make_screenshot_message())

        # 2. Think: ask the model what to do
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=e2b_tools.TOOL_SCHEMAS,
            tool_choice={"type": "any"},
        )

        choice = response.choices[0]
        msg = choice.message

        # Append assistant message to history
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
            print(f"  Model responded with text: {msg.content}")
            break

        # 3. Act: execute the tool
        tc = msg.tool_calls[0]
        name = tc.function.name
        try:
            args = json.loads(tc.function.arguments)
        except json.JSONDecodeError:
            args = {}

        STEP_COUNT += 1
        print(f"  [{STEP_COUNT}] Tool: {name}")
        if args:
            print(f"       Args: {json.dumps(args)}")

        result = e2b_tools.execute_tool(name, args)
        print(f"       Result: {result}")

        messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

        # If done, break
        if name == "done":
            break

    print("\n" + "-" * 60)
    print(f"\nAgent finished in {STEP_COUNT} tool calls.")

    # --- Proof screenshot ---
    desktop.wait(2000)
    print("\nTaking proof screenshot...")
    img_bytes = desktop.screenshot()
    out_path = os.path.join(os.path.dirname(__file__), "proof.png")
    with open(out_path, "wb") as f:
        f.write(img_bytes)
    print(f"Proof screenshot saved to {out_path} ({len(img_bytes)} bytes)")

    # --- Cleanup ---
    desktop.kill()
    print("Sandbox killed. Done!")


if __name__ == "__main__":
    asyncio.run(main())
