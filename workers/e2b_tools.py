import base64

_sandbox = None


def init(sandbox):
    """Set the E2B sandbox instance used by all tool functions."""
    global _sandbox
    _sandbox = sandbox


def take_screenshot() -> str:
    """Take a screenshot of the current desktop. Returns base64-encoded PNG."""
    img_bytes = _sandbox.screenshot()
    return base64.b64encode(img_bytes).decode("utf-8")


def click(x: int, y: int) -> str:
    """Left-click at screen coordinates (x, y)."""
    _sandbox.left_click(x, y)
    return f"Clicked at ({x}, {y})"


def double_click(x: int, y: int) -> str:
    """Double-click at screen coordinates (x, y)."""
    _sandbox.double_click(x, y)
    return f"Double-clicked at ({x}, {y})"


def type_text(text: str) -> str:
    """Type the given text string."""
    _sandbox.write(text)
    return f"Typed: {text}"


def press_key(key: str) -> str:
    """Press a key or key combo (e.g. 'enter', 'ctrl+c')."""
    _sandbox.press(key)
    return f"Pressed: {key}"


ALL_TOOLS = [take_screenshot, click, double_click, type_text, press_key]
