"""Episode poster — posts LeRobot episodes to RoboNet.

Reads episode data, validates, optionally pushes to HF, and posts via the SDK.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

from robonet_sdk import RoboNetClient, EpisodeCreateRequest, EpisodeResponse

from robonet_posting_agent.reader import LeRobotReader, EpisodeMetadata
from robonet_posting_agent.validator import LeRobotValidator, ValidationResult

logger = logging.getLogger(__name__)

# Default category mapping based on common task name patterns
CATEGORY_PATTERNS: dict[str, list[str]] = {
    "manipulation": [
        "pick", "place", "grasp", "stack", "push", "pull", "insert",
        "open", "close", "pour", "screw", "assemble", "sort", "lift",
        "fold", "wipe", "peg", "button", "drawer", "door",
    ],
    "locomotion": [
        "walk", "run", "stand", "balance", "step", "climb", "crawl",
        "jump", "turn", "navigate",
    ],
    "inspection": [
        "inspect", "scan", "measure", "detect", "identify", "check",
        "monitor", "observe", "survey",
    ],
    "navigation": [
        "navigate", "path", "avoid", "explore", "map", "follow", "reach",
    ],
}


@dataclass
class PostConfig:
    """Configuration for posting an episode.

    Args:
        robot_id: Robot identifier.
        task_category: Task category (e.g. 'manipulation/grasping').
            If None, auto-detected from task name.
        success: Whether the task succeeded.
        completion_rate: Completion rate [0, 1].
        failure_reason: Reason for failure (if success=False).
        title: Post title. If None, auto-generated from task name.
        description: Post description. If None, auto-generated.
        tags: Tags. If None, auto-generated from metadata.
        skip_validation: Skip LeRobot data validation.
        skip_hf_push: Skip HuggingFace Hub push.
        skip_media: Skip media generation and upload.
    """

    robot_id: str
    task_category: str | None = None
    success: bool = True
    completion_rate: float = 1.0
    failure_reason: str | None = None
    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    skip_validation: bool = False
    skip_hf_push: bool = True
    skip_media: bool = True


class EpisodePoster:
    """Posts LeRobot episodes to RoboNet.

    Full pipeline:
      1. Read metadata (LeRobotReader)
      2. Validate data (LeRobotValidator) — optional
      3. Push to HuggingFace (HFPusher) — optional
      4. Generate & upload media (MediaGenerator + MinIOUploader) — optional
      5. Generate title/description/tags
      6. POST /v1/episodes

    Args:
        client: RoboNetClient instance.
        reader: LeRobotReader instance (optional, created as needed).
        hf_pusher: HFPusher instance (optional, for HF integration).
        media_generator: MediaGenerator instance (optional).
        minio_uploader: MinIOUploader instance (optional).
    """

    def __init__(
        self,
        client: RoboNetClient,
        reader: LeRobotReader | None = None,
        hf_pusher: object | None = None,
        media_generator: object | None = None,
        minio_uploader: object | None = None,
    ) -> None:
        self.client = client
        self.reader = reader
        self.validator = LeRobotValidator()
        self.hf_pusher = hf_pusher
        self.media_generator = media_generator
        self.minio_uploader = minio_uploader

    def post(
        self,
        episode_path: str | Path,
        config: PostConfig,
    ) -> EpisodeResponse:
        """Post a single episode to RoboNet.

        Args:
            episode_path: Path to the LeRobot episode directory.
            config: Posting configuration.

        Returns:
            EpisodeResponse with created IDs.
        """
        ep_path = Path(episode_path)

        # Step 1: Read metadata
        if self.reader:
            metadata = self.reader.read_episode(ep_path)
        else:
            reader = LeRobotReader(ep_path.parent)
            metadata = reader.read_episode(ep_path)

        # Use the resolved path from metadata for subsequent steps
        resolved_path = Path(metadata.path)

        # Step 2: Validate (optional)
        if not config.skip_validation:
            validation = self.validator.validate(resolved_path)
            if not validation.ok:
                errors = "; ".join(validation.errors)
                raise ValueError(f"LeRobot validation failed: {errors}")
            if validation.warnings:
                for w in validation.warnings:
                    logger.warning("Validation warning: %s", w)

        # Step 3: Push to HuggingFace (optional)
        hf_repo: str | None = None
        hf_episode_index: int | None = None
        if not config.skip_hf_push and self.hf_pusher is not None:
            try:
                hf_result = self.hf_pusher.push(
                    lerobot_path=str(resolved_path),
                    robot_id=config.robot_id,
                    task_name=metadata.task_name,
                )
                hf_repo = hf_result.hf_repo
                hf_episode_index = hf_result.episode_index
                logger.info("Pushed to HuggingFace: %s", hf_repo)
            except Exception:
                logger.exception("HF push failed, continuing without HF data")

        # Step 4: Generate & upload media (optional)
        thumbnail_url: str | None = None
        video_url: str | None = None
        if not config.skip_media and self.media_generator and self.minio_uploader:
            try:
                thumbnail_url, video_url = self._process_media(
                    resolved_path, config.success
                )
            except Exception:
                logger.exception("Media processing failed, continuing without media")

        # Step 5: Build request with all data
        request = self._build_request(
            metadata, config,
            hf_repo=hf_repo,
            hf_episode_index=hf_episode_index,
            thumbnail_url=thumbnail_url,
            video_url=video_url,
        )

        # Step 6: POST to API
        logger.info("Posting episode: %s", request.title)
        response = self.client.post_episode(request)
        logger.info(
            "Posted successfully: episode_id=%s, post_id=%s",
            response.episode_id,
            response.post_id,
        )
        return response

    def _process_media(
        self, ep_path: Path, success: bool
    ) -> tuple[str | None, str | None]:
        """Generate and upload media files.

        Returns:
            Tuple of (thumbnail_url, video_url).
        """
        thumbnail_url = None
        video_url = None

        # Generate thumbnail GIF
        try:
            gif_bytes = self.media_generator.generate_thumbnail_gif(
                str(ep_path), success
            )
            if gif_bytes and self.minio_uploader:
                thumbnail_url = self.minio_uploader.upload_thumbnail(
                    ep_path.name, gif_bytes
                )
        except Exception:
            logger.exception("Thumbnail generation failed")

        # Generate preview video
        try:
            video_bytes = self.media_generator.generate_preview_video(str(ep_path))
            if video_bytes and self.minio_uploader:
                video_url = self.minio_uploader.upload_video(
                    ep_path.name, video_bytes
                )
        except Exception:
            logger.exception("Video generation failed")

        return thumbnail_url, video_url

    def post_batch(
        self,
        base_dir: str | Path,
        config: PostConfig,
        limit: int | None = None,
    ) -> list[EpisodeResponse]:
        """Post all episodes from a directory.

        Args:
            base_dir: Directory containing episode subdirectories.
            config: Base posting configuration (title/desc auto-generated per episode).
            limit: Max episodes to post (None = all).

        Returns:
            List of EpisodeResponses.
        """
        reader = LeRobotReader(base_dir)
        episodes = reader.list_episodes()

        if limit:
            episodes = episodes[:limit]

        results = []
        for ep_path in episodes:
            try:
                ep_config = PostConfig(
                    robot_id=config.robot_id,
                    task_category=config.task_category,
                    success=config.success,
                    completion_rate=config.completion_rate,
                    failure_reason=config.failure_reason,
                    title=None,
                    description=None,
                    tags=None,
                    skip_validation=config.skip_validation,
                    skip_hf_push=config.skip_hf_push,
                    skip_media=config.skip_media,
                )
                response = self.post(ep_path, ep_config)
                results.append(response)
            except Exception:
                logger.exception("Failed to post episode: %s", ep_path)
        return results

    def _build_request(
        self,
        metadata: EpisodeMetadata,
        config: PostConfig,
        hf_repo: str | None = None,
        hf_episode_index: int | None = None,
        thumbnail_url: str | None = None,
        video_url: str | None = None,
    ) -> EpisodeCreateRequest:
        """Build an EpisodeCreateRequest from metadata and config."""
        task_category = config.task_category or self._detect_category(metadata.task_name)
        title = config.title or self._generate_title(metadata, config)
        description = config.description or self._generate_description(metadata, config)
        tags = config.tags or self._generate_tags(metadata, config)

        return EpisodeCreateRequest(
            robot_id=config.robot_id,
            task_name=metadata.task_name,
            task_category=task_category,
            success=config.success,
            completion_rate=config.completion_rate,
            failure_reason=config.failure_reason,
            lerobot_path=metadata.path,
            fps=metadata.fps,
            modalities=metadata.modalities,
            title=title,
            description=description,
            tags=tags,
            hf_repo=hf_repo,
            hf_episode_index=hf_episode_index,
            thumbnail_url=thumbnail_url,
            video_url=video_url,
        )

    def _detect_category(self, task_name: str) -> str:
        """Auto-detect task category from task name."""
        name_lower = task_name.lower()
        for category, keywords in CATEGORY_PATTERNS.items():
            for kw in keywords:
                if kw in name_lower:
                    sub = kw if kw != category else "general"
                    return f"{category}/{sub}"
        return "other/general"

    def _generate_title(self, metadata: EpisodeMetadata, config: PostConfig) -> str:
        """Generate a title from metadata."""
        task = metadata.task_name.replace("_", " ").title()
        rate = f"{config.completion_rate * 100:.0f}%"
        if config.success:
            return f"{task} — {rate} completion"
        else:
            reason = f" ({config.failure_reason})" if config.failure_reason else ""
            return f"{task} — Failed{reason}"

    def _generate_description(self, metadata: EpisodeMetadata, config: PostConfig) -> str:
        """Generate description from metadata."""
        lines = [
            f"Task: {metadata.task_name}",
            f"Result: {'Success' if config.success else 'Failed'} ({config.completion_rate * 100:.0f}% completion)",
        ]
        if not config.success and config.failure_reason:
            lines.append(f"Failure reason: {config.failure_reason}")
        lines.append(f"FPS: {metadata.fps}, Frames: {metadata.total_frames}")
        lines.append(f"Modalities: {', '.join(metadata.modalities)}")
        if metadata.robot_type:
            lines.append(f"Robot type: {metadata.robot_type}")
        return "\n".join(lines)

    def _generate_tags(self, metadata: EpisodeMetadata, config: PostConfig) -> list[str]:
        """Generate tags from metadata."""
        tags: list[str] = []
        for part in metadata.task_name.lower().replace("-", "_").split("_"):
            if len(part) >= 3 and part not in tags:
                tags.append(part)
        for mod in metadata.modalities:
            if mod not in tags:
                tags.append(mod)
        if metadata.robot_type and metadata.robot_type not in tags:
            tags.append(metadata.robot_type)
        tags.append("success" if config.success else "failure")
        return tags[:10]
