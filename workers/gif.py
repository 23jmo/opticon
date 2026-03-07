"""
GIF encoding module for replay frames.

Converts captured replay frames (320x180 JPEG thumbnails) into animated GIFs
for timelapse visualization of agent sessions.
"""

import io
import logging
import os
from pathlib import Path

import imageio.v3 as iio
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def generate_gif(
    frames: list[dict],
    output_path: str,
    max_size_mb: float = 20,
) -> str | None:
    """
    Generate an animated GIF from a list of replay frame dicts.

    Each frame dict must have:
        - jpeg_bytes: bytes (JPEG image data)
        - timestamp: str (ISO-8601, unused but expected)
        - action: str (description, unused but expected)

    Args:
        frames: List of frame dicts from ReplayBuffer._frames.
        output_path: File path for the output GIF.
        max_size_mb: Maximum allowed file size in MB. If exceeded,
                     dimensions are halved and encoding retried once.

    Returns:
        The output_path on success, None on failure.
    """
    if not frames:
        logger.warning("No frames provided for GIF generation")
        return None

    try:
        return _encode_gif(frames, output_path, max_size_mb, scale_factor=1.0)
    except Exception as e:
        logger.error("GIF generation failed: %s", e)
        return None


def _encode_gif(
    frames: list[dict],
    output_path: str,
    max_size_mb: float,
    scale_factor: float,
) -> str | None:
    """Internal helper that encodes frames into a GIF, with optional downscaling."""
    selected_frames = frames
    total = len(frames)

    # Subsample if more than 500 frames
    if total > 500:
        step = total / 500
        indices = [int(i * step) for i in range(500)]
        selected_frames = [frames[i] for i in indices]
        logger.info(
            "Subsampled %d frames down to %d for GIF", total, len(selected_frames)
        )

    # Adaptive frame duration
    count = len(selected_frames)
    if count < 100:
        duration_ms = 500
    else:
        duration_ms = 200

    # Decode JPEG bytes into numpy arrays
    images = []
    for frame in selected_frames:
        img = Image.open(io.BytesIO(frame["jpeg_bytes"]))
        if scale_factor != 1.0:
            new_w = max(1, int(img.width * scale_factor))
            new_h = max(1, int(img.height * scale_factor))
            img = img.resize((new_w, new_h), Image.LANCZOS)
        img = img.convert("RGB")
        images.append(np.array(img))

    # Ensure output directory exists
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Write GIF using imageio
    # duration is in milliseconds for imageio v3
    iio.imwrite(
        output_path,
        images,
        extension=".gif",
        duration=duration_ms,
        loop=0,
    )

    # Check file size
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info("GIF written to %s (%.2f MB)", output_path, file_size_mb)

    if file_size_mb > max_size_mb:
        if scale_factor < 1.0:
            # Already retried with reduced resolution; give up
            logger.warning(
                "GIF exceeds %.1f MB (%.2f MB) even after downscaling; keeping as-is",
                max_size_mb,
                file_size_mb,
            )
            return output_path

        logger.info(
            "GIF exceeds %.1f MB (%.2f MB); retrying with halved resolution",
            max_size_mb,
            file_size_mb,
        )
        return _encode_gif(frames, output_path, max_size_mb, scale_factor=0.5)

    return output_path


def generate_gif_from_directory(
    replay_dir: str,
    session_id: str,
    agent_id: str,
    output_path: str | None = None,
) -> str | None:
    """
    Read saved replay frames from disk and generate an animated GIF.

    Frames are expected at: {replay_dir}/{session_id}/{agent_id}/frame-NNNN.jpg

    Args:
        replay_dir: Root replay directory.
        session_id: Session identifier.
        agent_id: Agent identifier.
        output_path: Where to save the GIF. Defaults to
                     {replay_dir}/{session_id}/{agent_id}/timelapse.gif

    Returns:
        The output path on success, None on failure.
    """
    frame_dir = Path(replay_dir) / session_id / agent_id

    if not frame_dir.is_dir():
        logger.error("Frame directory does not exist: %s", frame_dir)
        return None

    # Collect frame files sorted by name (frame-0000.jpg, frame-0001.jpg, ...)
    frame_files = sorted(frame_dir.glob("frame-*.jpg"))

    if not frame_files:
        logger.warning("No frame files found in %s", frame_dir)
        return None

    logger.info("Found %d frame files in %s", len(frame_files), frame_dir)

    # Build frame dicts matching ReplayBuffer format
    frames = []
    for f in frame_files:
        frames.append({
            "jpeg_bytes": f.read_bytes(),
            "timestamp": "",
            "action": "",
        })

    if output_path is None:
        output_path = str(frame_dir / "timelapse.gif")

    return generate_gif(frames, output_path)
