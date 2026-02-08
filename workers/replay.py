"""
Replay frame capture and upload module.

Captures low-res screenshots during the agent loop,
then uploads them as JPEG frames + a JSON manifest to R2
via pre-signed URLs obtained from the backend API.
"""

import io
import json
import logging
from datetime import datetime, timezone

import aiohttp
from PIL import Image

logger = logging.getLogger(__name__)

FRAME_WIDTH = 320
FRAME_HEIGHT = 180
JPEG_QUALITY = 30


class ReplayBuffer:
    """Accumulates downscaled screenshots during the agent loop."""

    def __init__(self):
        self._frames: list[dict] = []  # { "jpeg_bytes": bytes, "timestamp": str, "action": str }

    @property
    def frame_count(self) -> int:
        return len(self._frames)

    def capture_frame(self, raw_png_bytes: bytes, action_label: str) -> None:
        """Downscale a full-res PNG screenshot to a tiny JPEG and buffer it."""
        try:
            img = Image.open(io.BytesIO(raw_png_bytes))
            img = img.resize((FRAME_WIDTH, FRAME_HEIGHT), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=JPEG_QUALITY)
            jpeg_bytes = buf.getvalue()

            self._frames.append({
                "jpeg_bytes": jpeg_bytes,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "action": action_label,
            })
        except Exception as e:
            logger.warning("Failed to capture replay frame: %s", e)

    async def upload(
        self,
        session_id: str,
        agent_id: str,
        api_base_url: str,
        public_url_prefix: str,
    ) -> tuple[str, int] | None:
        """
        Request presigned URLs from the backend, upload all frames + manifest to R2.

        Returns (manifest_public_url, frame_count) on success, None on failure.
        """
        if not self._frames:
            logger.info("No replay frames to upload")
            return None

        frame_count = len(self._frames)
        logger.info("Uploading %d replay frames for agent %s", frame_count, agent_id)

        try:
            async with aiohttp.ClientSession() as http:
                # 1. Get presigned URLs from the backend
                resp = await http.post(
                    f"{api_base_url}/api/replay/upload-urls",
                    json={
                        "sessionId": session_id,
                        "agentId": agent_id,
                        "frameCount": frame_count,
                    },
                )
                if resp.status != 200:
                    logger.error("Failed to get upload URLs: %s", await resp.text())
                    return None

                url_data = await resp.json()
                frame_urls = url_data["frameUrls"]
                manifest_url = url_data["manifestUrl"]

                # 2. Upload frames in parallel
                tasks = []
                for i, frame in enumerate(self._frames):
                    tasks.append(
                        http.put(
                            frame_urls[i],
                            data=frame["jpeg_bytes"],
                            headers={"Content-Type": "image/jpeg"},
                        )
                    )

                results = await asyncio.gather(*tasks, return_exceptions=True)
                failed = sum(1 for r in results if isinstance(r, Exception) or (hasattr(r, "status") and r.status >= 400))
                if failed:
                    logger.warning("%d/%d frame uploads failed", failed, frame_count)

                # Close response objects
                for r in results:
                    if hasattr(r, "release"):
                        await r.release()

                # 3. Build and upload manifest
                prefix = f"replays/{session_id}/{agent_id}"
                manifest = {
                    "sessionId": session_id,
                    "agentId": agent_id,
                    "frameCount": frame_count,
                    "frames": [
                        {
                            "index": i,
                            "timestamp": frame["timestamp"],
                            "url": f"{public_url_prefix}/{prefix}/frame-{str(i).zfill(4)}.jpg",
                            "action": frame["action"],
                        }
                        for i, frame in enumerate(self._frames)
                    ],
                }

                manifest_resp = await http.put(
                    manifest_url,
                    data=json.dumps(manifest).encode(),
                    headers={"Content-Type": "application/json"},
                )
                if manifest_resp.status >= 400:
                    logger.error("Failed to upload manifest: %s", await manifest_resp.text())
                    return None

                manifest_public_url = f"{public_url_prefix}/{prefix}/manifest.json"
                logger.info("Replay upload complete: %s", manifest_public_url)
                return manifest_public_url, frame_count

        except Exception as e:
            logger.error("Replay upload failed: %s", e)
            return None


# Need asyncio for gather
import asyncio  # noqa: E402
