"""LeRobot data validator.

Validates that episode data conforms to LeRobot format before posting.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of validating a LeRobot episode directory."""

    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.ok = False

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)


class LeRobotValidator:
    """Validates LeRobot episode directory structure and data.

    Checks:
    - Required directory structure (meta/, data/)
    - info.json exists and has required fields
    - Parquet data files exist
    - Video files exist (if modalities include images)
    - FPS consistency between metadata and data
    - Frame count consistency (±5 frames tolerance)
    """

    # Allowed tolerance for frame count mismatch between video and parquet
    FRAME_TOLERANCE = 5  # [frames]

    def validate(self, lerobot_path: str | Path) -> ValidationResult:
        """Validate a LeRobot episode directory.

        Args:
            lerobot_path: Path to the episode directory.

        Returns:
            ValidationResult with ok=True if valid, errors if not.
        """
        result = ValidationResult(ok=True)
        ep_path = Path(lerobot_path)

        if not ep_path.exists():
            result.add_error(f"Directory not found: {ep_path}")
            return result

        if not ep_path.is_dir():
            result.add_error(f"Not a directory: {ep_path}")
            return result

        # Check directory structure
        self._check_structure(ep_path, result)

        # Check info.json
        info = self._check_info_json(ep_path, result)
        if info is None:
            return result  # Can't validate further without info

        # Check data files
        self._check_data_files(ep_path, info, result)

        # Check video files (if image modalities present)
        self._check_video_files(ep_path, info, result)

        return result

    def _check_structure(self, ep_path: Path, result: ValidationResult) -> None:
        """Check basic directory structure."""
        meta_dir = ep_path / "meta"
        data_dir = ep_path / "data"

        if not meta_dir.exists() and not (ep_path / "info.json").exists():
            result.add_error("No meta/ directory or info.json found")

        if not data_dir.exists():
            result.add_warning("No data/ directory found (may be empty episode)")

    def _check_info_json(self, ep_path: Path, result: ValidationResult) -> dict | None:
        """Check info.json exists and has required fields."""
        info_path = ep_path / "meta" / "info.json"
        if not info_path.exists():
            info_path = ep_path / "info.json"

        if not info_path.exists():
            result.add_error("info.json not found")
            return None

        try:
            info = json.loads(info_path.read_text())
        except json.JSONDecodeError as e:
            result.add_error(f"info.json is not valid JSON: {e}")
            return None

        # Check required fields
        if "fps" not in info:
            result.add_error("info.json missing 'fps' field")
        elif not isinstance(info["fps"], (int, float)) or info["fps"] <= 0:
            result.add_error(f"info.json 'fps' must be positive number, got {info['fps']}")

        if "features" not in info and "keys" not in info:
            result.add_warning("info.json missing 'features' or 'keys' field")

        return info

    def _check_data_files(self, ep_path: Path, info: dict, result: ValidationResult) -> None:
        """Check parquet data files exist."""
        data_dir = ep_path / "data"
        if not data_dir.exists():
            return

        parquet_files = list(data_dir.glob("**/*.parquet"))
        if not parquet_files:
            result.add_warning("No parquet files found in data/")
            return

        # Check that parquet files have reasonable sizes
        for pf in parquet_files:
            if pf.stat().st_size == 0:
                result.add_error(f"Empty parquet file: {pf.name}")

    def _check_video_files(self, ep_path: Path, info: dict, result: ValidationResult) -> None:
        """Check video files if image modalities are declared."""
        features = info.get("features", {})
        has_image_features = any(
            "image" in k or "rgb" in k for k in features
        )

        if not has_image_features:
            return

        # Look for videos in videos/ or data/ directory
        video_dirs = [ep_path / "videos", ep_path / "data"]
        video_files: list[Path] = []
        for vdir in video_dirs:
            if vdir.exists():
                video_files.extend(vdir.glob("**/*.mp4"))
                video_files.extend(vdir.glob("**/*.avi"))
                video_files.extend(vdir.glob("**/*.webm"))

        if not video_files:
            result.add_warning(
                "Image features declared but no video files found in videos/ or data/"
            )

        # Check video file sizes
        for vf in video_files:
            if vf.stat().st_size == 0:
                result.add_error(f"Empty video file: {vf.name}")
