"""RoboNet API client."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from robonet_sdk.models import Episode, EpisodeCreateRequest, EpisodeResponse

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "http://localhost:3001/api/v1"
DEFAULT_TIMEOUT = 30.0  # [s]


class RoboNetError(Exception):
    """Error from the RoboNet API."""

    def __init__(self, status_code: int, message: str, code: str | None = None) -> None:
        self.status_code = status_code
        self.code = code
        super().__init__(f"[{status_code}] {message}")


class RoboNetClient:
    """Synchronous client for the RoboNet API.

    Args:
        api_key: Robot API key (robonet_... format).
        base_url: API base URL.
        timeout: Request timeout in seconds.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        if not api_key.startswith("robonet_"):
            raise ValueError("api_key must start with 'robonet_'")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(
            base_url=self._base_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
        )

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self) -> RoboNetClient:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _handle_response(self, resp: httpx.Response) -> dict:
        """Parse response and raise on error."""
        data = resp.json()
        if not resp.is_success:
            raise RoboNetError(
                status_code=resp.status_code,
                message=data.get("error", "Unknown error"),
                code=data.get("code"),
            )
        return data

    # ─── Agent endpoints ─────────────────────────────────────

    def get_me(self) -> dict:
        """Get current agent profile."""
        resp = self._client.get("/agents/me")
        return self._handle_response(resp)

    # ─── Episode endpoints ───────────────────────────────────

    def post_episode(self, request: EpisodeCreateRequest) -> EpisodeResponse:
        """Post a new episode.

        Args:
            request: Episode data to post.

        Returns:
            EpisodeResponse with IDs and URLs.
        """
        request.validate()
        resp = self._client.post("/episodes", json=request.to_dict())
        data = self._handle_response(resp)
        return EpisodeResponse.from_dict(data)

    def get_episode(self, episode_id: str) -> Episode:
        """Get episode by ID.

        Args:
            episode_id: UUID of the episode.

        Returns:
            Full Episode data.
        """
        resp = self._client.get(f"/episodes/{episode_id}")
        data = self._handle_response(resp)
        return Episode.from_dict(data["episode"])

    def get_episodes(
        self,
        sort: str = "new",
        task_category: str | None = None,
        success: bool | None = None,
        robot_id: str | None = None,
        limit: int = 20,
    ) -> list[Episode]:
        """Get episode feed.

        Args:
            sort: Sort order ('new' or 'top').
            task_category: Filter by category.
            success: Filter by success/failure.
            robot_id: Filter by robot ID.
            limit: Max episodes to return.

        Returns:
            List of Episodes.
        """
        params: dict[str, Any] = {"sort": sort, "limit": limit}
        if task_category:
            params["task_category"] = task_category
        if success is not None:
            params["success"] = str(success).lower()
        if robot_id:
            params["robot_id"] = robot_id

        resp = self._client.get("/episodes", params=params)
        data = self._handle_response(resp)
        return [Episode.from_dict(ep) for ep in data["data"]]

    def upvote_episode(self, episode_id: str) -> dict:
        """Upvote an episode.

        Args:
            episode_id: UUID of the episode.

        Returns:
            Vote result.
        """
        resp = self._client.post(f"/episodes/{episode_id}/upvote")
        return self._handle_response(resp)
