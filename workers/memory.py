"""
Persistent per-user memory layer using Mem0.

Provides retrieve/store operations so agents remember user preferences,
context, and facts across sessions. Uses local HuggingFace embeddings
and file-based Qdrant vector store — no external services needed.

All operations are wrapped in try/except so memory failures never crash
the agent loop.
"""

import logging
import os

logger = logging.getLogger(__name__)


class MemoryManager:
    """Lazy-initialised wrapper around Mem0's Memory class."""

    def __init__(self):
        self._memory = None

    def _get_memory(self):
        """Initialise the Memory instance on first use (downloads embedding
        model ~80 MB on first run, cached in ~/.cache/huggingface/)."""
        if self._memory is not None:
            return self._memory

        try:
            from mem0 import Memory

            config = {
                "llm": {
                    "provider": "openai",
                    "config": {
                        "model": "openai/gpt-4.1-nano",
                        "api_key": os.environ.get("DEDALUS_API_KEY", ""),
                        "openai_base_url": "https://api.dedaluslabs.ai/v1",
                    },
                },
                "embedder": {
                    "provider": "huggingface",
                    "config": {
                        "model": "sentence-transformers/all-MiniLM-L6-v2",
                        "embedding_dims": 384,
                    },
                },
                "vector_store": {
                    "provider": "qdrant",
                    "config": {
                        "collection_name": "opticon_memories",
                        "path": os.path.join(
                            os.path.dirname(__file__), "..", ".memories"
                        ),
                        "embedding_model_dims": 384,
                    },
                },
            }

            self._memory = Memory.from_config(config)
            logger.info("Mem0 memory layer initialised")
        except Exception as e:
            logger.warning("Failed to initialise Mem0: %s — memory disabled", e)
            self._memory = None

        return self._memory

    def retrieve_memories(self, user_id: str, query: str) -> str:
        """Search for relevant memories and return a formatted string for
        system-prompt injection.  Returns empty string on failure."""
        try:
            mem = self._get_memory()
            if mem is None:
                return ""

            results = mem.search(query=query, user_id=user_id, limit=5)

            memories = []
            if isinstance(results, dict) and "results" in results:
                memories = results["results"]
            elif isinstance(results, list):
                memories = results

            if not memories:
                return ""

            lines = []
            for m in memories:
                text = m.get("memory", "") if isinstance(m, dict) else str(m)
                if text:
                    lines.append(f"- {text}")

            if not lines:
                return ""

            header = (
                "## User Memory\n"
                "The following facts are remembered from previous sessions "
                "with this user:\n"
            )
            formatted = header + "\n".join(lines)
            logger.info("Retrieved %d memories for user %s", len(lines), user_id)
            return formatted

        except Exception as e:
            logger.warning("Failed to retrieve memories: %s", e)
            return ""

    def store_memories(self, user_id: str, task_description: str, result: str) -> None:
        """Extract and persist new memories from the completed task."""
        try:
            mem = self._get_memory()
            if mem is None:
                return

            conversation_text = (
                f"User asked: {task_description}\n\nAgent result: {result}"
            )

            add_result = mem.add(conversation_text, user_id=user_id)

            count = 0
            if isinstance(add_result, dict) and "results" in add_result:
                count = len(add_result["results"])
            elif isinstance(add_result, list):
                count = len(add_result)

            logger.info("Stored %d memories for user %s", count, user_id)

        except Exception as e:
            logger.warning("Failed to store memories: %s", e)
