"""Quick test: spin up an E2B desktop sandbox, take a screenshot, save it."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

sys.path.insert(0, os.path.dirname(__file__))

from e2b_desktop import Sandbox
import e2b_tools


def main():
    print("Booting E2B desktop sandbox...")
    desktop = Sandbox.create(timeout=60)
    print(f"Sandbox ID: {desktop.sandbox_id}")

    # Init our tools module with the live sandbox
    e2b_tools.init(desktop)

    # Wait a moment for the desktop to fully render
    desktop.wait(3000)

    # Take screenshot via our tool wrapper
    print("Taking screenshot...")
    b64 = e2b_tools.take_screenshot()

    # Save to file
    import base64
    img_bytes = base64.b64decode(b64)
    out_path = os.path.join(os.path.dirname(__file__), "screenshot.png")
    with open(out_path, "wb") as f:
        f.write(img_bytes)
    print(f"Screenshot saved to {out_path} ({len(img_bytes)} bytes)")

    # Quick smoke test of other tools
    print("Testing click...")
    print(e2b_tools.click(100, 100))

    print("Testing type_text...")
    print(e2b_tools.type_text("hello"))

    print("Testing press_key...")
    print(e2b_tools.press_key("enter"))

    # Take another screenshot after interactions
    desktop.wait(1000)
    b64_after = e2b_tools.take_screenshot()
    img_after = base64.b64decode(b64_after)
    out_path_after = os.path.join(os.path.dirname(__file__), "screenshot_after.png")
    with open(out_path_after, "wb") as f:
        f.write(img_after)
    print(f"Post-interaction screenshot saved to {out_path_after}")

    # Cleanup
    desktop.kill()
    print("Sandbox killed. Done!")


if __name__ == "__main__":
    main()
