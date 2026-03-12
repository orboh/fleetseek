"""Data models for RoboNet API."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class EpisodeCreateRequest:
    """Request body for POST /episodes."""

    robot_id: str
    task_name: str
    task_category: str
    success: bool
    completion_rate: float  # [0, 1]
    lerobot_path: str
    fps: int  # [Hz]
    modalities: list[str]
    title: str
    description: str
    tags: list[str] = field(default_factory=list)
    failure_reason: str | None = None
    hf_repo: str | None = None
    hf_episode_index: int | None = None
    thumbnail_url: str | None = None
    video_url: str | None = None

    def validate(self) -> None:
        """Validate fields before sending to API."""
        if not self.robot_id:
            raise ValueError("robot_id is required")
        if not self.task_name:
            raise ValueError("task_name is required")
        if not self.task_category:
            raise ValueError("task_category is required")
        if not 0.0 <= self.completion_rate <= 1.0:
            raise ValueError("completion_rate must be between 0 and 1")
        if self.fps <= 0:
            raise ValueError("fps must be a positive integer")
        if not self.modalities:
            raise ValueError("modalities must be a non-empty list")
        if not self.title:
            raise ValueError("title is required")
        if not self.description:
            raise ValueError("description is required")

    def to_dict(self) -> dict:
        """Convert to API request payload."""
        self.validate()
        d = {
            "robot_id": self.robot_id,
            "task_name": self.task_name,
            "task_category": self.task_category,
            "success": self.success,
            "completion_rate": self.completion_rate,
            "lerobot_path": self.lerobot_path,
            "fps": self.fps,
            "modalities": self.modalities,
            "title": self.title,
            "description": self.description,
            "tags": self.tags,
        }
        if self.failure_reason:
            d["failure_reason"] = self.failure_reason
        if self.hf_repo:
            d["hf_repo"] = self.hf_repo
        if self.hf_episode_index is not None:
            d["hf_episode_index"] = self.hf_episode_index
        if self.thumbnail_url:
            d["thumbnail_url"] = self.thumbnail_url
        if self.video_url:
            d["video_url"] = self.video_url
        return d


@dataclass
class EpisodeResponse:
    """Response from POST /episodes."""

    episode_id: str
    post_id: str
    hf_repo: str | None = None
    web_url: str | None = None
    thumbnail_url: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> EpisodeResponse:
        return cls(
            episode_id=data["episode_id"],
            post_id=data["post_id"],
            hf_repo=data.get("hf_repo"),
            web_url=data.get("web_url"),
            thumbnail_url=data.get("thumbnail_url"),
        )


@dataclass
class Episode:
    """Full episode data from GET /episodes/:id."""

    id: str
    post_id: str
    robot_id: str
    task_name: str
    task_category: str
    success: bool
    completion_rate: float
    failure_reason: str | None
    fps: int
    modalities: list[str]
    hf_repo: str | None
    title: str
    description: str
    upvote_count: int
    comment_count: int
    created_at: str
    robot_name: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> Episode:
        return cls(
            id=data["id"],
            post_id=data["post_id"],
            robot_id=data["robot_id"],
            task_name=data["task_name"],
            task_category=data["task_category"],
            success=data["success"],
            completion_rate=data["completion_rate"],
            failure_reason=data.get("failure_reason"),
            fps=data["fps"],
            modalities=data.get("modalities", []),
            hf_repo=data.get("hf_repo"),
            title=data["title"],
            description=data.get("description", ""),
            upvote_count=data.get("upvote_count", 0),
            comment_count=data.get("comment_count", 0),
            created_at=data["created_at"],
            robot_name=data.get("robot_name"),
        )
