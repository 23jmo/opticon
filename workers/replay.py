"""
Replay frame capture and upload module.

Captures low-res screenshots during the agent loop, then either:
  - Saves them locally to disk (default, no config needed)
  - Uploads to Cloudflare R2 via presigned URLs (when R2_PUBLIC_URL is set)
"""

import asyncio
import io
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

logger = logging.getLogger(__name__)

FRAME_WIDTH = 320
FRAME_HEIGHT = 180
JPEG_QUALITY = 30


class ReplayBuffer:
    """Accumulates downscaled screenshots during the agent loop."""

    def __init__(self):
        self._frames: list[dict] = []

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

    def save_local(
        self,
        session_id: str,
        agent_id: str,
        replay_dir: str,
        serve_base_url: str,
    ) -> tuple[str, int] | None:
        """
        Save frames + manifest to a local directory.
        Returns (manifest_url, frame_count) on success, None on failure.

        Files go to: {replay_dir}/{session_id}/{agent_id}/
        Served via:  {serve_base_url}/{session_id}/{agent_id}/manifest.json
        """
        if not self._frames:
            logger.info("No replay frames to save")
            return None

        frame_count = len(self._frames)
        out_dir = Path(replay_dir) / session_id / agent_id
        out_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Saving %d replay frames to %s", frame_count, out_dir)

        # Write frames
        for i, frame in enumerate(self._frames):
            frame_path = out_dir / f"frame-{str(i).zfill(4)}.jpg"
            frame_path.write_bytes(frame["jpeg_bytes"])

        # Build manifest
        url_prefix = f"{serve_base_url}/{session_id}/{agent_id}"
        manifest = {
            "sessionId": session_id,
            "agentId": agent_id,
            "frameCount": frame_count,
            "frames": [
                {
                    "index": i,
                    "timestamp": frame["timestamp"],
                    "url": f"{url_prefix}/frame-{str(i).zfill(4)}.jpg",
                    "action": frame["action"],
                }
                for i, frame in enumerate(self._frames)
            ],
        }

        manifest_path = out_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest))

        manifest_url = f"{url_prefix}/manifest.json"
        logger.info("Replay saved locally: %s", manifest_url)
        return manifest_url, frame_count

    async def upload_r2(
        self,
        session_id: str,
        agent_id: str,
        api_base_url: str,
        public_url_prefix: str,
    ) -> tuple[str, int] | None:
        """
        Upload frames + manifest to R2 via presigned URLs.
        Returns (manifest_public_url, frame_count) on success, None on failure.
        """
        if not self._frames:
            logger.info("No replay frames to upload")
            return None

        import aiohttp

        frame_count = len(self._frames)
        logger.info("Uploading %d replay frames to R2 for agent %s", frame_count, agent_id)

        try:
            async with aiohttp.ClientSession() as http:
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

                tasks = [
                    http.put(
                        frame_urls[i],
                        data=frame["jpeg_bytes"],
                        headers={"Content-Type": "image/jpeg"},
                    )
                    for i, frame in enumerate(self._frames)
                ]

                results = await asyncio.gather(*tasks, return_exceptions=True)
                failed = sum(
                    1 for r in results
                    if isinstance(r, Exception) or (hasattr(r, "status") and r.status >= 400)
                )
                if failed:
                    logger.warning("%d/%d frame uploads failed", failed, frame_count)

                for r in results:
                    if hasattr(r, "release"):
                        await r.release()

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
                logger.info("Replay uploaded to R2: %s", manifest_public_url)
                return manifest_public_url, frame_count

        except Exception as e:
            logger.error("R2 replay upload failed: %s", e)
            return None
