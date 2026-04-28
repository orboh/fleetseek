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

    # ─── Experience endpoints ────────────────────────────────

    def post_experience(
        self,
        type: str,
        title: str,
        data: dict,
        description: str | None = None,
        tags: list[str] | None = None,
        applicability: dict | None = None,
        visibility: str = "org",
    ) -> dict:
        """Post a new Experience (SkillExperience or DebugExperience).

        Args:
            type: Experience type — "skill" or "debug_note".
            title: Human-readable title.
            data: Type-specific payload (e.g. episode data or debug fields).
            description: Optional free-text description.
            tags: Optional list of tag strings.
            applicability: Optional applicability metadata dict.
            visibility: Visibility scope (default "org").

        Returns:
            Created Experience dict from the API.
        """
        payload: dict[str, Any] = {
            "type": type,
            "title": title,
            "data": data,
            "visibility": visibility,
        }
        if description is not None:
            payload["description"] = description
        if tags is not None:
            payload["tags"] = tags
        if applicability is not None:
            payload["applicability"] = applicability
        resp = self._client.post("/experiences", json=payload)
        return self._handle_response(resp)

    def get_experience(self, experience_id: str) -> dict:
        """Get an Experience by ID.

        Args:
            experience_id: Experience ID (exp_ + ULID format).

        Returns:
            Experience dict from the API.
        """
        resp = self._client.get(f"/experiences/{experience_id}")
        return self._handle_response(resp)

    def search_experiences(
        self,
        query: str | None = None,
        type: str | None = None,
        tags: list[str] | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search Experiences by keyword and/or filters.

        Args:
            query: Optional free-text search query.
            type: Optional type filter — "skill" or "debug_note".
            tags: Optional list of tags to filter by.
            limit: Maximum number of results to return (default 20).

        Returns:
            List of matching Experience dicts.
        """
        payload: dict[str, Any] = {"limit": limit}
        if query is not None:
            payload["query"] = query
        if type is not None:
            payload["type"] = type
        if tags is not None:
            payload["tags"] = tags
        resp = self._client.post("/experiences/search", json=payload)
        data = self._handle_response(resp)
        return data if isinstance(data, list) else data.get("data", [])

    def post_apply_intent(self, experience_id: str) -> dict:
        """Send an intent-to-apply signal for an Experience.

        This signals that a robot is about to attempt the Experience,
        which is used to track trust signals.

        Args:
            experience_id: Experience ID (exp_ + ULID format).

        Returns:
            API response dict.
        """
        resp = self._client.post(f"/experiences/{experience_id}/intent_to_apply")
        return self._handle_response(resp)

    def post_apply_result(
        self,
        experience_id: str,
        outcome: str,
        outcome_notes: str | None = None,
        session_id: str | None = None,
    ) -> dict:
        """Report the result of applying an Experience.

        Calling this method automatically triggers a trust_score update
        on the server side.

        Args:
            experience_id: Experience ID (exp_ + ULID format).
            outcome: Result — "success", "failure", "partial", or "skipped".
            outcome_notes: Optional free-text notes about the outcome.
            session_id: Optional session identifier for correlation.

        Returns:
            Application result dict from the API.
        """
        payload: dict[str, Any] = {"outcome": outcome}
        if outcome_notes is not None:
            payload["outcome_notes"] = outcome_notes
        if session_id is not None:
            payload["session_id"] = session_id
        resp = self._client.post(
            f"/experiences/{experience_id}/applications", json=payload
        )
        return self._handle_response(resp)

    # ─── Robot endpoints ─────────────────────────────────────

    def register_robot(
        self,
        model: str = "unitree_g1",
        serial_number: str | None = None,
        mac_address: str | None = None,
        hw_revision: str | None = None,
    ) -> dict:
        """Register a robot with FleetSeek and obtain its fleetseek_id.

        Args:
            model: Robot model identifier (default "unitree_g1").
            serial_number: Optional hardware serial number.
            mac_address: Optional MAC address for identification.
            hw_revision: Optional hardware revision string.

        Returns:
            Registration response dict including fleetseek_id (rbt_ + ULID).
        """
        payload: dict[str, Any] = {"model": model}
        if serial_number is not None:
            payload["serial_number"] = serial_number
        if mac_address is not None:
            payload["mac_address"] = mac_address
        if hw_revision is not None:
            payload["hw_revision"] = hw_revision
        resp = self._client.post("/robots/register", json=payload)
        return self._handle_response(resp)

    def post_config_snapshot(
        self,
        robot_id: str,
        sdk_version: str | None = None,
        firmware_version: str | None = None,
        os_version: str | None = None,
        installed_packages: dict | None = None,
    ) -> dict:
        """Upload a configuration snapshot (L3) for a robot.

        Args:
            robot_id: FleetSeek robot ID (rbt_ + ULID format).
            sdk_version: Optional SDK version string.
            firmware_version: Optional firmware version string.
            os_version: Optional OS version string.
            installed_packages: Optional dict of package name → version.

        Returns:
            Updated config snapshot dict from the API.
        """
        payload: dict[str, Any] = {}
        if sdk_version is not None:
            payload["sdk_version"] = sdk_version
        if firmware_version is not None:
            payload["firmware_version"] = firmware_version
        if os_version is not None:
            payload["os_version"] = os_version
        if installed_packages is not None:
            payload["installed_packages"] = installed_packages
        resp = self._client.post(
            f"/robots/{robot_id}/config_snapshot", json=payload
        )
        return self._handle_response(resp)
