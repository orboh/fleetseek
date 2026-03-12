"""MuJoCo simulation DataSource.

Collects episode data from MuJoCo physics simulation environments.
"""

from __future__ import annotations

import json
import logging
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from robonet_posting_agent.datasources.base import DataSource, EpisodeData, RobotMetadata

logger = logging.getLogger(__name__)

try:
    import mujoco
    HAS_MUJOCO = True
except ImportError:
    HAS_MUJOCO = False


@dataclass
class MuJoCoConfig:
    """Configuration for MuJoCo DataSource.

    Args:
        model_path: Path to MuJoCo XML model file.
        fps: Recording frame rate [Hz].
        robot_model: Robot model name.
        robot_manufacturer: Robot manufacturer.
        dof: Degrees of freedom.
        output_dir: Directory for saving episode data.
        cameras: Camera names for image capture.
    """

    model_path: str
    fps: int = 30  # [Hz]
    robot_model: str = "simulated"
    robot_manufacturer: str | None = None
    dof: int | None = None
    output_dir: str | None = None
    cameras: list[str] | None = None


class MuJoCoDataSource(DataSource):
    """DataSource for MuJoCo simulation environments.

    Collects joint states, images (from cameras), and actions
    from MuJoCo simulation steps. Data is synchronous — FPS is
    guaranteed since simulation time is controlled.

    Args:
        config: MuJoCo configuration.
    """

    def __init__(self, config: MuJoCoConfig) -> None:
        if not HAS_MUJOCO:
            raise RuntimeError(
                "mujoco package is not installed. "
                "Install it with: pip install mujoco"
            )
        self.config = config
        self._recording = False
        self._task_name: str | None = None
        self._frames: list[dict] = []
        self._output_dir = config.output_dir or tempfile.mkdtemp(prefix="robonet_mujoco_")

    def get_robot_metadata(self) -> RobotMetadata:
        """Return MuJoCo robot metadata."""
        return RobotMetadata(
            model=self.config.robot_model,
            manufacturer=self.config.robot_manufacturer,
            dof=self.config.dof,
            sim_only=True,  # Always simulation
        )

    def start_recording(self, task_name: str) -> None:
        """Start recording simulation data.

        Args:
            task_name: Name of the task.
        """
        if self._recording:
            raise RuntimeError("Already recording")
        self._recording = True
        self._task_name = task_name
        self._frames = []
        logger.info("Started MuJoCo recording: %s", task_name)

    def record_frame(self, qpos: list[float], action: list[float], images: dict[str, bytes] | None = None) -> None:
        """Record a single simulation frame.

        Call this after each simulation step during recording.

        Args:
            qpos: Joint positions.
            action: Action applied.
            images: Camera name -> image bytes mapping.
        """
        if not self._recording:
            raise RuntimeError("Not recording")
        self._frames.append({
            "timestamp": len(self._frames) / self.config.fps,  # [s]
            "qpos": qpos,
            "action": action,
            "images": images or {},
        })

    def stop_recording(
        self,
        success: bool = True,
        failure_reason: str | None = None,
        completion_rate: float = 1.0,
    ) -> EpisodeData:
        """Stop recording and save data in LeRobot format.

        Args:
            success: Whether the task succeeded.
            failure_reason: Reason for failure.
            completion_rate: Task completion rate [0, 1].

        Returns:
            EpisodeData with path to saved data.
        """
        if not self._recording:
            raise RuntimeError("Not recording")

        self._recording = False
        total_frames = len(self._frames)

        # Determine modalities from recorded data
        modalities = ["joints"]
        if self._frames and self._frames[0].get("images"):
            modalities.extend(self._frames[0]["images"].keys())

        # Save in LeRobot format
        ep_dir = Path(self._output_dir) / f"episode_{int(time.time())}"
        meta_dir = ep_dir / "meta"
        data_dir = ep_dir / "data"
        meta_dir.mkdir(parents=True, exist_ok=True)
        data_dir.mkdir(parents=True, exist_ok=True)

        # Write info.json
        info = {
            "fps": self.config.fps,
            "total_frames": total_frames,
            "robot_type": self.config.robot_model,
            "features": {
                "observation.state": {"dtype": "float32", "shape": [self.config.dof or len(self._frames[0]["qpos"]) if self._frames else 0]},
                "action": {"dtype": "float32", "shape": [len(self._frames[0]["action"]) if self._frames else 0]},
            },
        }
        # Add image features
        if self._frames and self._frames[0].get("images"):
            for cam_name in self._frames[0]["images"]:
                info["features"][f"observation.images.{cam_name}"] = {
                    "dtype": "image",
                    "shape": [480, 640, 3],
                }

        (meta_dir / "info.json").write_text(json.dumps(info, indent=2))

        # Write tasks.jsonl
        (meta_dir / "tasks.jsonl").write_text(
            json.dumps({"task_index": 0, "task": self._task_name}) + "\n"
        )

        # Save camera images as MP4 videos
        if self._frames and self._frames[0].get("images"):
            videos_dir = ep_dir / "videos"
            videos_dir.mkdir(parents=True, exist_ok=True)
            for cam_name in self._frames[0]["images"]:
                self._save_video(videos_dir / f"{cam_name}.mp4", cam_name)

        logger.info(
            "MuJoCo recording saved: %s (%d frames, %.1fs)",
            ep_dir, total_frames, total_frames / self.config.fps if self.config.fps else 0,
        )

        self._frames = []

        return EpisodeData(
            lerobot_path=str(ep_dir),
            task_name=self._task_name or "unknown",
            fps=self.config.fps,
            total_frames=total_frames,
            modalities=modalities,
            success=success,
            completion_rate=completion_rate,
            failure_reason=failure_reason,
        )

    def _save_video(self, output_path: Path, camera_name: str) -> None:
        """Save recorded image frames as an MP4 video using ffmpeg.

        Args:
            output_path: Path for the output MP4 file.
            camera_name: Camera name to extract frames from.
        """
        with tempfile.TemporaryDirectory(prefix="robonet_frames_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            frame_count = 0
            for i, frame in enumerate(self._frames):
                img_bytes = frame.get("images", {}).get(camera_name)
                if img_bytes:
                    (tmp_path / f"frame_{i:06d}.png").write_bytes(img_bytes)
                    frame_count += 1

            if frame_count == 0:
                logger.warning("No frames for camera %s, skipping video", camera_name)
                return

            cmd = [
                "ffmpeg", "-y",
                "-framerate", str(self.config.fps),
                "-i", str(tmp_path / "frame_%06d.png"),
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(output_path),
            ]
            try:
                subprocess.run(cmd, capture_output=True, check=True, timeout=120)
                logger.info("Saved video: %s (%d frames)", output_path, frame_count)
            except FileNotFoundError:
                logger.error("ffmpeg not found. Install it: apt install ffmpeg")
            except subprocess.CalledProcessError as e:
                logger.error("ffmpeg video encoding failed: %s", e.stderr.decode())
            except subprocess.TimeoutExpired:
                logger.error("ffmpeg video encoding timed out")
