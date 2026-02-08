import base64

_sandbox = None


def init(sandbox):
    """Set the E2B sandbox instance used by all tool functions."""
    global _sandbox
    _sandbox = sandbox


# --- Tool functions (called by the agentic loop) ---

def screenshot_raw_bytes() -> bytes:
    """Take a screenshot and return raw PNG bytes."""
    return _sandbox.screenshot()


def screenshot_as_base64() -> str:
    """Take a screenshot and return base64-encoded PNG."""
    img_bytes = screenshot_raw_bytes()
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
    """Type the given text string. Newlines are typed as Enter key presses."""
    parts = text.split("\n")
    for i, part in enumerate(parts):
        if part:
            _sandbox.write(part)
        if i < len(parts) - 1:
            _sandbox.press("Enter")
    return f"Typed: {text}"


def press_key(key: str) -> str:
    """Press a key or key combo (e.g. 'enter', 'ctrl+c')."""
    _sandbox.press(key)
    return f"Pressed: {key}"


def move_mouse(x: int, y: int) -> str:
    """Move the mouse cursor to screen coordinates (x, y) without clicking."""
    _sandbox.move_mouse(x, y)
    return f"Moved mouse to ({x}, {y})"


def scroll(x: int, y: int, direction: str = "down", amount: int = 3) -> str:
    """Scroll at screen coordinates (x, y) in the given direction."""
    _sandbox.move_mouse(x, y)
    _sandbox.scroll(direction=direction, amount=amount)
    return f"Scrolled {direction} by {amount} at ({x}, {y})"


# --- Dispatch map: name -> function ---

TOOL_FUNCTIONS = {
    "click": click,
    "double_click": double_click,
    "type_text": type_text,
    "press_key": press_key,
    "move_mouse": move_mouse,
    "scroll": scroll,
}

# --- OpenAI-compatible tool schemas for chat.completions.create() ---
# No take_screenshot -- screenshots are injected automatically as user messages.

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "click",
            "description": "Left-click at screen coordinates (x, y).",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"},
                },
                "required": ["x", "y"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "double_click",
            "description": "Double-click at screen coordinates (x, y).",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"},
                },
                "required": ["x", "y"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "type_text",
            "description": "Type the given text string on the keyboard.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to type"},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "press_key",
            "description": "Press a key or key combo (e.g. 'enter', 'ctrl+c', 'alt+F2').",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Key or combo to press"},
                },
                "required": ["key"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_mouse",
            "description": "Move the mouse cursor to screen coordinates (x, y) without clicking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"},
                },
                "required": ["x", "y"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "scroll",
            "description": "Scroll at screen coordinates (x, y) in a direction. Use for scrolling web pages, documents, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"},
                    "direction": {
                        "type": "string",
                        "enum": ["up", "down"],
                        "description": "Direction to scroll",
                    },
                    "amount": {
                        "type": "integer",
                        "description": "Number of scroll steps (default 3)",
                    },
                },
                "required": ["x", "y", "direction"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "done",
            "description": "Call this when the task is complete. Provide a summary of what you accomplished.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Summary of what was accomplished"},
                },
                "required": ["summary"],
            },
        },
    },
]


def execute_tool(name, arguments):
    """Execute a tool by name with the given arguments dict. Returns result string."""
    if name == "done":
        return arguments.get("summary", "Task complete")
    func = TOOL_FUNCTIONS.get(name)
    if not func:
        return f"Unknown tool: {name}"
    return func(**arguments)
