"""
Tests for the GIF encoding module.
"""

import io
import os
import tempfile

import pytest
from PIL import Image

from gif import generate_gif, generate_gif_from_directory


def _make_frame(color: tuple[int, int, int]) -> dict:
    """Create a synthetic replay frame with a solid color image."""
    img = Image.new("RGB", (320, 180), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=30)
    return {
        "jpeg_bytes": buf.getvalue(),
        "timestamp": "2026-03-06T00:00:00+00:00",
        "action": f"test-action-{color[0]}",
    }


def _build_frames(count: int = 10) -> list[dict]:
    """Build a list of synthetic frames with varying colors."""
    colors = [
        (255, 0, 0),
        (0, 255, 0),
        (0, 0, 255),
        (255, 255, 0),
        (255, 0, 255),
        (0, 255, 255),
        (128, 128, 128),
        (64, 64, 64),
        (192, 192, 192),
        (0, 0, 0),
    ]
    return [_make_frame(colors[i % len(colors)]) for i in range(count)]


class TestGenerateGif:
    def test_basic_generation(self, tmp_path):
        """Generate a GIF from 10 synthetic frames and verify it exists and is small."""
        frames = _build_frames(10)
        output_path = str(tmp_path / "test.gif")

        result = generate_gif(frames, output_path)

        assert result == output_path
        assert os.path.exists(output_path)
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        assert size_mb < 20, f"GIF is {size_mb:.2f} MB, expected under 20 MB"
        assert size_mb > 0, "GIF file is empty"

    def test_empty_frames_returns_none(self, tmp_path):
        """Passing an empty frame list should return None."""
        output_path = str(tmp_path / "empty.gif")
        result = generate_gif([], output_path)
        assert result is None

    def test_gif_is_valid_image(self, tmp_path):
        """The generated file should be openable as a GIF."""
        frames = _build_frames(5)
        output_path = str(tmp_path / "valid.gif")

        generate_gif(frames, output_path)

        img = Image.open(output_path)
        assert img.format == "GIF"
        assert img.size == (320, 180)


class TestGenerateGifFromDirectory:
    def test_from_directory(self, tmp_path):
        """Write frames to disk, then generate a GIF from the directory."""
        session_id = "sess-001"
        agent_id = "agent-001"
        frame_dir = tmp_path / session_id / agent_id
        frame_dir.mkdir(parents=True)

        frames = _build_frames(5)
        for i, frame in enumerate(frames):
            (frame_dir / f"frame-{str(i).zfill(4)}.jpg").write_bytes(
                frame["jpeg_bytes"]
            )

        result = generate_gif_from_directory(
            str(tmp_path), session_id, agent_id
        )

        expected = str(frame_dir / "timelapse.gif")
        assert result == expected
        assert os.path.exists(expected)

    def test_missing_directory_returns_none(self, tmp_path):
        """A nonexistent directory should return None."""
        result = generate_gif_from_directory(
            str(tmp_path), "no-session", "no-agent"
        )
        assert result is None

    def test_custom_output_path(self, tmp_path):
        """Custom output_path should be respected."""
        session_id = "sess-002"
        agent_id = "agent-002"
        frame_dir = tmp_path / session_id / agent_id
        frame_dir.mkdir(parents=True)

        frames = _build_frames(3)
        for i, frame in enumerate(frames):
            (frame_dir / f"frame-{str(i).zfill(4)}.jpg").write_bytes(
                frame["jpeg_bytes"]
            )

        custom_path = str(tmp_path / "custom_output.gif")
        result = generate_gif_from_directory(
            str(tmp_path), session_id, agent_id, output_path=custom_path
        )

        assert result == custom_path
        assert os.path.exists(custom_path)
