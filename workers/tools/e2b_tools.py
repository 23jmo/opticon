"""Factory function that creates E2B Desktop SDK tool wrappers for a sandbox instance."""

import base64
from e2b_desktop import Sandbox


def create_tools(sandbox: Sandbox, emit_log):
    """Return a list of tool functions bound to the given sandbox.

    Each tool emits a log message via *emit_log(action, reasoning)* so the
    backend can relay agent activity to the frontend in real time.

    The Dedalus SDK auto-extracts schemas from type hints + docstrings,
    so every function here is fully annotated.
    """

    def screenshot() -> str:
        """Take a screenshot of the current desktop and return it as a base64-encoded PNG string."""
        emit_log("screenshot", "Capturing current desktop state")
        image_bytes = sandbox.screenshot()
        return base64.b64encode(image_bytes).decode("utf-8")

    def click(x: int, y: int) -> str:
        """Left-click at the given (x, y) pixel coordinates on the desktop."""
        emit_log("click", f"Clicking at ({x}, {y})")
        sandbox.left_click(x, y)
        return f"Clicked at ({x}, {y})"

    def double_click(x: int, y: int) -> str:
        """Double-click at the given (x, y) pixel coordinates on the desktop."""
        emit_log("double_click", f"Double-clicking at ({x}, {y})")
        sandbox.double_click(x, y)
        return f"Double-clicked at ({x}, {y})"

    def type_text(text: str) -> str:
        """Type the given text string using the keyboard."""
        emit_log("type_text", f"Typing: {text[:80]}{'...' if len(text) > 80 else ''}")
        sandbox.write(text)
        return f"Typed: {text}"

    def press_key(key: str) -> str:
        """Press a keyboard key or key combination (e.g. 'Enter', 'ctrl+c', 'Tab')."""
        emit_log("press_key", f"Pressing key: {key}")
        sandbox.press(key)
        return f"Pressed: {key}"

    def scroll(x: int, y: int, direction: str, amount: int) -> str:
        """Scroll at the given (x, y) coordinates. direction is 'up' or 'down'. amount is number of scroll units."""
        emit_log("scroll", f"Scrolling {direction} by {amount} at ({x}, {y})")
        sandbox.scroll(x, y, direction=direction, amount=amount)
        return f"Scrolled {direction} by {amount} at ({x}, {y})"

    return [screenshot, click, double_click, type_text, press_key, scroll]
