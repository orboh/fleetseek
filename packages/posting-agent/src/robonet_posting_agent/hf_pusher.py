"""HuggingFace Hub pusher.

Pushes LeRobot episode data to HuggingFace Hub datasets.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from huggingface_hub import HfApi, create_repo
except ImportError:
    HfApi = None
    create_repo = None


@dataclass
class HFPushResult:
    """Result of pushing episode data to HuggingFace Hub."""

    hf_repo: str  # e.g. "robonet/g1_sim_001-box_stacking"
    episode_index: int
    repo_url: str  # Full URL to the dataset repo


class HFPusher:
    """Pushes LeRobot episode data to HuggingFace Hub.

    Args:
        hf_token: HuggingFace API token.
        org: HuggingFace organization name.
    """

    def __init__(self, hf_token: str, org: str = "robonet") -> None:
        if HfApi is None:
            raise RuntimeError(
                "huggingface_hub is not installed. "
                "Install it with: pip install huggingface_hub"
            )
        self.hf_token = hf_token
        self.org = org
        self.api = HfApi(token=hf_token)

    def push(
        self,
        lerobot_path: str | Path,
        robot_id: str,
        task_name: str,
        episode_index: int = 0,
    ) -> HFPushResult:
        """Push episode data to HuggingFace Hub.

        Args:
            lerobot_path: Path to LeRobot episode directory.
            robot_id: Robot identifier.
            task_name: Task name (used in repo naming).
            episode_index: Episode index within the dataset.

        Returns:
            HFPushResult with repo info.
        """
        ep_path = Path(lerobot_path)
        if not ep_path.exists():
            raise FileNotFoundError(f"Episode directory not found: {ep_path}")

        # Generate repo name: {org}/{robot_id}-{task_name}
        safe_task = task_name.lower().replace(" ", "_").replace("/", "_")
        repo_id = f"{self.org}/{robot_id}-{safe_task}"

        logger.info("Pushing to HuggingFace: %s (episode %d)", repo_id, episode_index)

        # Create repo if it doesn't exist
        try:
            create_repo(
                repo_id=repo_id,
                repo_type="dataset",
                token=self.hf_token,
                exist_ok=True,
            )
        except Exception as e:
            logger.error("Failed to create repo %s: %s", repo_id, e)
            raise

        # Upload episode directory
        try:
            self.api.upload_folder(
                folder_path=str(ep_path),
                repo_id=repo_id,
                repo_type="dataset",
                path_in_repo=f"episode_{episode_index:06d}",
                commit_message=f"Add episode {episode_index} via RoboNet",
            )
        except Exception as e:
            logger.error("Failed to upload to %s: %s", repo_id, e)
            raise

        # Generate/update dataset card
        try:
            card_content = self.generate_dataset_card(robot_id, task_name, episode_index + 1)
            self.api.upload_file(
                path_or_fileobj=card_content.encode("utf-8"),
                path_in_repo="README.md",
                repo_id=repo_id,
                repo_type="dataset",
                commit_message="Update dataset card via RoboNet",
            )
        except Exception:
            logger.warning("Failed to update dataset card for %s", repo_id)

        repo_url = f"https://huggingface.co/datasets/{repo_id}"
        logger.info("Successfully pushed to %s", repo_url)

        return HFPushResult(
            hf_repo=repo_id,
            episode_index=episode_index,
            repo_url=repo_url,
        )

    def get_episode_count(self, repo_id: str) -> int:
        """Get number of episodes already in a HF repo.

        Args:
            repo_id: HuggingFace repo ID.

        Returns:
            Number of episode directories found.
        """
        try:
            files = self.api.list_repo_tree(
                repo_id=repo_id,
                repo_type="dataset",
                path_in_repo="",
            )
            count = sum(
                1 for f in files
                if hasattr(f, "path") and f.path.startswith("episode_")
            )
            return count
        except Exception:
            return 0

    def generate_dataset_card(
        self,
        robot_id: str,
        task_name: str,
        episode_count: int,
    ) -> str:
        """Generate HuggingFace dataset card (README.md).

        Args:
            robot_id: Robot identifier.
            task_name: Task name.
            episode_count: Total number of episodes.

        Returns:
            Markdown string for the dataset card.
        """
        return f"""---
license: apache-2.0
task_categories:
  - robotics
tags:
  - lerobot
  - robonet
  - {robot_id}
  - {task_name}
---

# {robot_id} — {task_name}

Robot episode dataset uploaded via [RoboNet](https://www.robonet.com).

## Dataset Info

| Field | Value |
|-------|-------|
| Robot | `{robot_id}` |
| Task | `{task_name}` |
| Episodes | {episode_count} |
| Format | LeRobot |

## Usage with LeRobot

```python
from lerobot.common.datasets.lerobot_dataset import LeRobotDataset

dataset = LeRobotDataset("{self.org}/{robot_id}-{task_name}")
print(f"Number of episodes: {{dataset.num_episodes}}")
print(f"Number of frames: {{dataset.num_frames}}")
```

## Usage with HuggingFace Datasets

```python
from datasets import load_dataset

dataset = load_dataset("{self.org}/{robot_id}-{task_name}")
```

## License

Apache 2.0

---

*Uploaded via [RoboNet](https://www.robonet.com) — The Social Network for AI Robots*
"""
