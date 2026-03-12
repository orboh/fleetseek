"""Media generator for episode thumbnails and preview videos.

Generates GIF thumbnails and web-optimized preview videos from LeRobot episode data.
Requires ffmpeg to be installed on the system.
"""

from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


class MediaGenerator:
    """Generates thumbnail GIFs and preview videos from LeRobot episodes.

    Uses ffmpeg for all media processing.
    """

    # Output dimensions
    THUMBNAIL_WIDTH = 320   # [px]
    THUMBNAIL_HEIGHT = 240  # [px]
    VIDEO_WIDTH = 640       # [px]
    VIDEO_HEIGHT = 480      # [px]
    MAX_VIDEO_DURATION = 60  # [s]
    GIF_FRAME_COUNT = 30
    GIF_FPS = 10  # [Hz]

    def _find_video(self, lerobot_path: str) -> Path | None:
        """Find the best video file in a LeRobot episode directory.

        Prefers rgb_head camera, falls back to any available video.
        """
        ep_path = Path(lerobot_path)
        search_dirs = [ep_path / "videos", ep_path / "data"]

        # Prefer rgb_head
        for d in search_dirs:
            if not d.exists():
                continue
            for pattern in ["*rgb_head*", "*head*", "*rgb*", "*.mp4"]:
                videos = list(d.glob(pattern))
                if videos:
                    return videos[0]

        return None

    def generate_thumbnail_gif(self, lerobot_path: str, success: bool) -> bytes | None:
        """Generate a 3-second GIF thumbnail from episode video.

        Args:
            lerobot_path: Path to LeRobot episode directory.
            success: Whether the episode was successful.
                Failed episodes get a red border.

        Returns:
            GIF bytes, or None if no video found.
        """
        video_path = self._find_video(lerobot_path)
        if video_path is None:
            logger.warning("No video found in %s for GIF generation", lerobot_path)
            return None

        with tempfile.NamedTemporaryFile(suffix=".gif", delete=True) as tmp:
            # Build ffmpeg filter
            filters = [
                f"fps={self.GIF_FPS}",
                f"scale={self.THUMBNAIL_WIDTH}:{self.THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease",
                f"pad={self.THUMBNAIL_WIDTH}:{self.THUMBNAIL_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
            ]

            # Add red border for failed episodes
            if not success:
                filters.append(
                    "drawbox=x=0:y=0:w=iw:h=ih:color=red@0.8:t=3"
                )

            filter_str = ",".join(filters)

            cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-t", "3",  # 3 seconds
                "-vf", filter_str,
                "-loop", "0",
                str(tmp.name),
            ]

            try:
                subprocess.run(
                    cmd, capture_output=True, check=True, timeout=30
                )
                return Path(tmp.name).read_bytes()
            except FileNotFoundError:
                logger.error("ffmpeg not found. Install it: apt install ffmpeg")
                return None
            except subprocess.CalledProcessError as e:
                logger.error("ffmpeg GIF generation failed: %s", e.stderr.decode())
                return None
            except subprocess.TimeoutExpired:
                logger.error("ffmpeg GIF generation timed out")
                return None

    def generate_preview_video(self, lerobot_path: str) -> bytes | None:
        """Generate a web-optimized preview video.

        Args:
            lerobot_path: Path to LeRobot episode directory.

        Returns:
            MP4 bytes, or None if no source video found.
        """
        video_path = self._find_video(lerobot_path)
        if video_path is None:
            logger.warning("No video found in %s for preview generation", lerobot_path)
            return None

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=True) as tmp:
            cmd = [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-t", str(self.MAX_VIDEO_DURATION),
                "-vf", f"scale={self.VIDEO_WIDTH}:{self.VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
                       f"pad={self.VIDEO_WIDTH}:{self.VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264",
                "-crf", "28",
                "-preset", "fast",
                "-movflags", "+faststart",  # Enable web streaming
                "-an",  # No audio for robot videos
                str(tmp.name),
            ]

            try:
                subprocess.run(
                    cmd, capture_output=True, check=True, timeout=120
                )
                return Path(tmp.name).read_bytes()
            except FileNotFoundError:
                logger.error("ffmpeg not found. Install it: apt install ffmpeg")
                return None
            except subprocess.CalledProcessError as e:
                logger.error("ffmpeg video generation failed: %s", e.stderr.decode())
                return None
            except subprocess.TimeoutExpired:
                logger.error("ffmpeg video generation timed out")
                return None
