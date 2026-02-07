import base64
import json

_sandbox = None


def init(sandbox):
    """Set the E2B sandbox instance used by all tool functions."""
    global _sandbox
    _sandbox = sandbox


# --- Tool functions (called by the agentic loop) ---

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


def move_mouse(x: int, y: int) -> str:
    """Move the mouse cursor to screen coordinates (x, y) without clicking."""
    _sandbox.move_mouse(x, y)
    return f"Moved mouse to ({x}, {y})"


# --- Dispatch map: name -> function ---

TOOL_FUNCTIONS = {
    "click": click,
    "double_click": double_click,
    "type_text": type_text,
    "press_key": press_key,
    "move_mouse": move_mouse,
    # take_screenshot is NOT here — it's handled specially in the loop
    # (result is injected as an image, not text)
}

# --- OpenAI-compatible tool schemas for chat.completions.create() ---

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "Take a screenshot of the current desktop to see what is on screen.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
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
]


def execute_tool(name, arguments):
    """Execute a tool by name with the given arguments dict. Returns result string."""
    if name == "take_screenshot":
        return take_screenshot()
    func = TOOL_FUNCTIONS.get(name)
    if not func:
        return f"Unknown tool: {name}"
    return func(**arguments)
