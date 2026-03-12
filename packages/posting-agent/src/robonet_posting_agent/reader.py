"""LeRobot episode data reader.

Reads episode metadata from a LeRobot-style directory structure.
Expected layout:
    episode_dir/
        meta/
            info.json          # Episode metadata (fps, modalities, etc.)
            tasks.jsonl        # Task descriptions
        data/
            ...                # Actual episode data (parquet, video, etc.)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class EpisodeMetadata:
    """Metadata extracted from a LeRobot episode directory."""

    path: str
    fps: int  # [Hz]
    modalities: list[str]
    task_name: str
    total_frames: int
    robot_type: str | None = None
    extra: dict = field(default_factory=dict)


class LeRobotReader:
    """Reads episode metadata from LeRobot directory format.

    Args:
        base_dir: Root directory containing episode directories.
    """

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        if not self.base_dir.exists():
            raise FileNotFoundError(f"Directory not found: {self.base_dir}")

    def read_episode(self, episode_dir: str | Path) -> EpisodeMetadata:
        """Read metadata from a single episode directory.

        Args:
            episode_dir: Path to the episode directory (absolute or relative to base_dir).

        Returns:
            Parsed EpisodeMetadata.
        """
        ep_path = Path(episode_dir)
        if not ep_path.is_absolute():
            ep_path = self.base_dir / ep_path

        if not ep_path.exists():
            raise FileNotFoundError(f"Episode directory not found: {ep_path}")

        # Read info.json
        info_path = ep_path / "meta" / "info.json"
        if info_path.exists():
            info = json.loads(info_path.read_text())
        else:
            # Fallback: try info.json at root
            alt_info = ep_path / "info.json"
            if alt_info.exists():
                info = json.loads(alt_info.read_text())
            else:
                logger.warning("No info.json found in %s, using defaults", ep_path)
                info = {}

        fps = info.get("fps", 30)
        total_frames = info.get("total_frames", info.get("num_frames", 0))
        robot_type = info.get("robot_type")

        # Extract modalities from keys or features
        modalities = self._extract_modalities(info, ep_path)

        # Read task name
        task_name = self._extract_task_name(info, ep_path)

        return EpisodeMetadata(
            path=str(ep_path),
            fps=fps,
            modalities=modalities,
            task_name=task_name,
            total_frames=total_frames,
            robot_type=robot_type,
            extra=info,
        )

    def list_episodes(self) -> list[Path]:
        """List all episode directories under base_dir.

        Returns:
            List of episode directory paths.
        """
        episodes = []
        for child in sorted(self.base_dir.iterdir()):
            if child.is_dir() and (child / "meta").exists():
                episodes.append(child)
            elif child.is_dir() and (child / "info.json").exists():
                episodes.append(child)
        return episodes

    def _extract_modalities(self, info: dict, ep_path: Path) -> list[str]:
        """Extract sensor modalities from episode info.

        Looks at 'features', 'keys', or data directory contents.
        """
        # LeRobot v2 format: features dict
        features = info.get("features", {})
        if features:
            modalities = []
            for key in features:
                if "image" in key or "rgb" in key:
                    modalities.append(key.replace("observation.", "").replace("images.", ""))
                elif "state" in key or "joint" in key or "position" in key:
                    if "joints" not in modalities:
                        modalities.append("joints")
                elif "effort" in key or "torque" in key or "force" in key:
                    if "ft" not in modalities:
                        modalities.append("ft")
            return modalities if modalities else ["joints"]

        # LeRobot v1 format: keys list
        keys = info.get("keys", [])
        if keys:
            modalities = []
            for key in keys:
                if "image" in key or "rgb" in key:
                    modalities.append(key.split("/")[-1] if "/" in key else key)
                elif "state" in key or "joint" in key:
                    if "joints" not in modalities:
                        modalities.append("joints")
            return modalities if modalities else ["joints"]

        # Fallback: check data directory for parquet/video files
        data_dir = ep_path / "data"
        if data_dir.exists():
            modalities = []
            for f in data_dir.iterdir():
                if f.suffix in (".mp4", ".avi", ".webm"):
                    modalities.append(f.stem)
                elif f.suffix == ".parquet" and "state" in f.stem:
                    if "joints" not in modalities:
                        modalities.append("joints")
            if modalities:
                return modalities

        return ["joints"]  # Default fallback

    def _extract_task_name(self, info: dict, ep_path: Path) -> str:
        """Extract task name from info or tasks.jsonl."""
        # Direct field
        if "task" in info:
            return info["task"]
        if "task_name" in info:
            return info["task_name"]

        # tasks.jsonl
        tasks_path = ep_path / "meta" / "tasks.jsonl"
        if tasks_path.exists():
            first_line = tasks_path.read_text().strip().split("\n")[0]
            try:
                task_data = json.loads(first_line)
                return task_data.get("task", task_data.get("task_name", ep_path.name))
            except json.JSONDecodeError:
                pass

        # Fallback: directory name
        return ep_path.name
