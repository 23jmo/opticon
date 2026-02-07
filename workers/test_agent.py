"""
End-to-end test: spin up an E2B sandbox, run a custom vision-based
agentic loop via Dedalus chat.completions.create() to open Firefox,
print every tool call live, save a proof screenshot.
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
    "You are an AI agent controlling a Linux desktop via tools. "
    "You can take screenshots to see the screen, then click, type, or press keys to interact. "
    "Always call take_screenshot first to see what's on screen before acting. "
    "After each action, take another screenshot to verify the result. "
    "When your task is complete, respond with a text summary of what you accomplished — do NOT call any more tools."
)

MODEL = "anthropic/claude-sonnet-4-5-20250929"
MAX_STEPS = 30
STEP_COUNT = 0


async def run_agent_loop(client, messages):
    """Vision-based observe-think-act loop. Screenshots sent as images."""
    global STEP_COUNT

    for step in range(MAX_STEPS):
        response = await client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=e2b_tools.TOOL_SCHEMAS,
        )

        choice = response.choices[0]
        msg = choice.message

        # No tool calls = model is done, return its text
        if not msg.tool_calls:
            return msg.content or "(no response)"

        # Append assistant message with tool calls to history
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

        # Execute each tool call
        for tc in msg.tool_calls:
            STEP_COUNT += 1
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            # Print live
            print(f"\n  [{STEP_COUNT}] Tool: {name}")
            if args:
                print(f"       Args: {json.dumps(args)}")

            result = e2b_tools.execute_tool(name, args)

            if name == "take_screenshot":
                # Inject as an actual image so the model can SEE it
                print(f"       Result: [screenshot captured, {len(result)} chars base64]")
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
                print(f"       Result: {result}")
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

    return "(max steps reached)"


async def main():
    # --- Boot sandbox ---
    print("Booting E2B desktop sandbox...")
    desktop = Sandbox.create(timeout=180)
    print(f"Sandbox ID: {desktop.sandbox_id}")

    desktop.wait(3000)

    # --- Wire up tools ---
    e2b_tools.init(desktop)

    # --- Create Daedalus client (NOT runner) ---
    print("Initializing Dedalus client...")
    client = AsyncDedalus()

    # --- Run the agent ---
    task = "Open the Firefox web browser on this Linux desktop."
    print(f"\nTask: {task}")
    print("Running vision-based agent loop:\n" + "-" * 60)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Complete this task: {task}"},
    ]

    result = await run_agent_loop(client, messages)

    print("\n" + "-" * 60)
    print(f"\nAgent finished in {STEP_COUNT} tool calls.")
    print(f"Output:\n{result}")

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
