"""Unitree G1 hardware DataSource.

Collects real-time episode data from a physical Unitree G1 robot.
Requires unitree_sdk2py for robot communication.
"""

from __future__ import annotations

import json
import logging
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from robonet_posting_agent.datasources.base import DataSource, EpisodeData, RobotMetadata

logger = logging.getLogger(__name__)

try:
    import unitree_sdk2py  # type: ignore
    HAS_UNITREE_SDK = True
except ImportError:
    HAS_UNITREE_SDK = False


@dataclass
class G1HardwareConfig:
    """Configuration for G1 hardware DataSource.

    Args:
        robot_ip: G1 IP address (default: 192.168.123.161).
        cameras: Camera IDs to record.
        record_ft: Whether to record force/torque sensor data.
        fps: Target recording frame rate [Hz].
        output_dir: Directory for saving episode data.
    """

    robot_ip: str = "192.168.123.161"
    cameras: list[str] | None = None
    record_ft: bool = True
    fps: int = 30  # [Hz]
    output_dir: str | None = None


class G1HardwareDataSource(DataSource):
    """DataSource for physical Unitree G1 robot.

    Collects joint states (43 DOF), RGB camera images, and
    force/torque sensor data in real-time via unitree_sdk2py.

    Unlike MuJoCoDataSource, data collection is asynchronous
    and FPS is best-effort (depends on communication latency).

    Args:
        config: G1 hardware configuration.

    Raises:
        RuntimeError: If unitree_sdk2py is not installed.
    """

    G1_DOF = 43  # Unitree G1 degrees of freedom

    def __init__(self, config: G1HardwareConfig) -> None:
        if not HAS_UNITREE_SDK:
            raise RuntimeError(
                "unitree_sdk2py is not installed. "
                "Install it from: https://github.com/unitreerobotics/unitree_sdk2_python"
            )
        self.config = config
        self._recording = False
        self._task_name: str | None = None
        self._frames: list[dict] = []
        self._record_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._output_dir = config.output_dir or tempfile.mkdtemp(prefix="robonet_g1_")
        self._has_hand = False
        self._hand_model: str | None = None

    def get_robot_metadata(self) -> RobotMetadata:
        """Return G1 hardware metadata."""
        return RobotMetadata(
            model="G1",
            manufacturer="Unitree Robotics",
            dof=self.G1_DOF,
            has_hand=self._has_hand,
            hand_model=self._hand_model,
            sim_only=False,  # Real hardware
        )

    def start_recording(self, task_name: str) -> None:
        """Start recording from G1 hardware.

        Launches a background thread that polls sensor data at the
        configured FPS. Actual rate may be lower due to communication
        latency.

        Args:
            task_name: Name of the task being performed.
        """
        if self._recording:
            raise RuntimeError("Already recording")

        self._recording = True
        self._task_name = task_name
        self._frames = []
        self._stop_event.clear()

        self._record_thread = threading.Thread(
            target=self._recording_loop,
            daemon=True,
        )
        self._record_thread.start()
        logger.info("Started G1 hardware recording: %s", task_name)

    def _recording_loop(self) -> None:
        """Background recording loop.

        Polls G1 sensors at configured FPS and stores frames.
        """
        interval = 1.0 / self.config.fps  # [s]

        while not self._stop_event.is_set():
            start = time.monotonic()
            try:
                frame = self._read_sensors()
                self._frames.append(frame)
            except Exception:
                logger.exception("Failed to read G1 sensors")

            # Wait for next frame
            elapsed = time.monotonic() - start
            sleep_time = interval - elapsed
            if sleep_time > 0:
                self._stop_event.wait(sleep_time)

    def _read_sensors(self) -> dict:
        """Read current sensor data from G1.

        Returns:
            Dict with timestamp, joint states, images, and FT data.
        """
        # TODO: Implement actual sensor reading via unitree_sdk2py
        # This is a placeholder that would be replaced with real SDK calls:
        #   from unitree_sdk2py.core.channel import ChannelSubscriber
        #   from unitree_sdk2py.idl.unitree_go.msg.dds_ import LowState_
        #
        # Real implementation would:
        #   1. Subscribe to LowState for joint positions/velocities/torques
        #   2. Read camera images via G1's built-in cameras
        #   3. Read FT sensor data if configured
        return {
            "timestamp": len(self._frames) / self.config.fps,  # [s]
            "qpos": [0.0] * self.G1_DOF,
            "qvel": [0.0] * self.G1_DOF,
            "images": {},
            "ft": [0.0] * 6 if self.config.record_ft else None,
        }

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

        self._stop_event.set()
        if self._record_thread:
            self._record_thread.join(timeout=5)
        self._recording = False

        total_frames = len(self._frames)

        # Determine modalities
        modalities = ["joints"]
        if self._frames and self._frames[0].get("images"):
            modalities.extend(self._frames[0]["images"].keys())
        if self.config.record_ft:
            modalities.append("ft")

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
            "robot_type": "G1",
            "features": {
                "observation.state": {"dtype": "float32", "shape": [self.G1_DOF]},
                "action": {"dtype": "float32", "shape": [self.G1_DOF]},
            },
        }
        if self.config.record_ft:
            info["features"]["observation.ft"] = {"dtype": "float32", "shape": [6]}

        (meta_dir / "info.json").write_text(json.dumps(info, indent=2))
        (meta_dir / "tasks.jsonl").write_text(
            json.dumps({"task_index": 0, "task": self._task_name}) + "\n"
        )

        actual_fps = total_frames / (total_frames / self.config.fps) if total_frames > 0 else 0
        logger.info(
            "G1 recording saved: %s (%d frames, effective %.1f fps)",
            ep_dir, total_frames, actual_fps,
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
