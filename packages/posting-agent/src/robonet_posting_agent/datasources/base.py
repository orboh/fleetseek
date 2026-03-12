"""Abstract DataSource base class for robot episode data collection."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class RobotMetadata:
    """Metadata about the robot hardware."""

    model: str
    manufacturer: str | None = None
    dof: int | None = None
    has_hand: bool = False
    hand_model: str | None = None
    sim_only: bool = True


@dataclass
class EpisodeData:
    """Collected episode data in LeRobot-compatible format.

    Args:
        lerobot_path: Path to the LeRobot-format directory.
        task_name: Name of the task performed.
        fps: Recording frame rate [Hz].
        total_frames: Total number of frames recorded.
        modalities: List of sensor modalities (e.g. ['rgb_head', 'joints']).
        success: Whether the task succeeded.
        completion_rate: Task completion rate [0, 1].
        failure_reason: Reason for failure (if applicable).
    """

    lerobot_path: str
    task_name: str
    fps: int  # [Hz]
    total_frames: int
    modalities: list[str]
    success: bool = True
    completion_rate: float = 1.0  # [0, 1]
    failure_reason: str | None = None
    extra: dict = field(default_factory=dict)


class DataSource(ABC):
    """Abstract base class for robot data sources.

    Subclasses implement data collection for specific robot platforms.

    Lifecycle:
      1. __init__(config) — set up connection/environment
      2. get_robot_metadata() — query robot info
      3. start_recording(task_name) — begin data collection
      4. stop_recording(success, failure_reason) — end collection, return data
    """

    @abstractmethod
    def get_robot_metadata(self) -> RobotMetadata:
        """Return metadata about the robot.

        Returns:
            RobotMetadata with hardware specs.
        """
        ...

    @abstractmethod
    def start_recording(self, task_name: str) -> None:
        """Start recording episode data.

        Args:
            task_name: Name of the task being performed.
        """
        ...

    @abstractmethod
    def stop_recording(
        self,
        success: bool = True,
        failure_reason: str | None = None,
        completion_rate: float = 1.0,
    ) -> EpisodeData:
        """Stop recording and return collected data.

        Data must be saved in LeRobot-compatible format at the returned path.

        Args:
            success: Whether the task succeeded.
            failure_reason: Reason for failure.
            completion_rate: Task completion rate [0, 1].

        Returns:
            EpisodeData with path to LeRobot-format directory.
        """
        ...
