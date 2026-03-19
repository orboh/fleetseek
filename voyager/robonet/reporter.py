"""
voyager/robonet/reporter.py

VoyagerReporter: collect session data, post to RoboNet, manage
pending_posts.jsonl buffer for offline resilience.
Also manages the heartbeat background thread (Phase 6-B).
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

import httpx

from .identity import RobotIdentity
from .title_generator import generate_title

logger = logging.getLogger(__name__)

_PENDING_FILENAME = "pending_posts.jsonl"
_HEARTBEAT_INTERVAL_SECONDS = 60


class VoyagerReporter:
    """Post Voyager session data to RoboNet.

    Usage:
        reporter = VoyagerReporter(identity=identity, ckpt_dir=ckpt_dir)
        reporter.flush_pending()   # call once on startup
        reporter.start_heartbeat_loop()  # optional: start background heartbeat
        ...
        reporter.post_session(completed_tasks, failed_tasks, skills)
    """

    def __init__(self, identity: Optional[RobotIdentity], ckpt_dir: str) -> None:
        self.identity = identity
        self.ckpt_dir = ckpt_dir
        self._pending_path = Path(ckpt_dir) / _PENDING_FILENAME
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._heartbeat_stop = threading.Event()

    # ── public API ─────────────────────────────────────────────────────────

    def report_heartbeat(
        self,
        current_task: Optional[str] = None,
        current_iteration: Optional[int] = None,
        skills_count: Optional[int] = None,
        mc_connected: bool = False,
    ) -> None:
        """Send a heartbeat to POST /voyager/heartbeat.

        No-op when identity is None. Never raises.
        """
        if self.identity is None:
            return

        payload: dict = {
            "robot_id": self.identity.robot_id,
            "current_task": current_task,
            "current_iteration": current_iteration,
            "skills_count": skills_count,
            "mc_connected": mc_connected,
            "reported_at": datetime.now(timezone.utc).isoformat(),
        }
        url = f"{self.identity.robonet_base_url.rstrip('/')}/voyager/heartbeat"
        headers = {
            "Authorization": f"Bearer {self.identity.api_key}",
            "Content-Type": "application/json",
        }
        try:
            httpx.post(url, json=payload, headers=headers, timeout=10.0)
        except Exception as exc:
            logger.warning(f"RoboNet heartbeat failed (non-fatal): {exc}")

    def start_heartbeat_loop(self, interval: int = _HEARTBEAT_INTERVAL_SECONDS) -> None:
        """Start a background daemon thread that sends heartbeats every `interval` seconds."""
        if self._heartbeat_thread is not None and self._heartbeat_thread.is_alive():
            return

        self._heartbeat_stop.clear()

        def _loop() -> None:
            while not self._heartbeat_stop.wait(timeout=interval):
                self.report_heartbeat()

        self._heartbeat_thread = threading.Thread(target=_loop, daemon=True)
        self._heartbeat_thread.start()

    def stop_heartbeat_loop(self) -> None:
        """Signal the heartbeat thread to stop."""
        self._heartbeat_stop.set()

    def post_session(
        self,
        completed_tasks: list[str],
        failed_tasks: list[str],
        skills: dict,
        total_iterations: Optional[int] = None,
    ) -> bool:
        """Build payload, buffer locally, then post.

        Returns True if the post succeeded.
        """
        payload = self._build_payload(
            completed_tasks=completed_tasks,
            failed_tasks=failed_tasks,
            skills=skills,
            total_iterations=total_iterations,
        )
        self._append_pending(payload)
        return self._flush_pending()

    def flush_pending(self) -> None:
        """Re-send any buffered posts. Call once on startup."""
        self._flush_pending()

    # ── internal helpers ───────────────────────────────────────────────────

    def _build_payload(
        self,
        completed_tasks: list[str],
        failed_tasks: list[str],
        skills: dict,
        total_iterations: Optional[int],
    ) -> dict:
        try:
            title = generate_title(completed_tasks, failed_tasks, skills)
        except Exception as exc:
            logger.warning(f"Title generation failed ({exc}), using fallback")
            import hashlib
            h = hashlib.sha256("|".join(completed_tasks).encode()).hexdigest()[:8]
            title = f"Voyager session {h}"
        session_id = str(uuid4())
        success = len(completed_tasks) > 0
        total = len(completed_tasks) + len(failed_tasks)
        completion_rate = len(completed_tasks) / max(total, 1)

        voyager_data: dict = {
            "session_id": session_id,
            "skills_acquired": list(skills.keys()),
            "skills_code": {
                name: info.get("program_code", "") if isinstance(info, dict) else str(info)
                for name, info in skills.items()
            },
            "tasks_completed": completed_tasks,
            "tasks_failed": failed_tasks,
        }
        if total_iterations is not None:
            voyager_data["total_iterations"] = total_iterations

        description = (
            f"Completed: {len(completed_tasks)} tasks. "
            f"Failed: {len(failed_tasks)} tasks."
        )

        return {
            "robot_id": self.identity.robot_id,
            "task_name": "minecraft_lifelong_learning",
            "task_category": "game/minecraft",
            "success": success,
            "completion_rate": completion_rate,
            "lerobot_path": f"voyager://{session_id}",
            "fps": 20,
            "modalities": ["text"],
            "title": title,
            "description": description,
            "tags": ["voyager", "minecraft"],
            "voyager_data": voyager_data,
        }

    def _append_pending(self, payload: dict) -> None:
        self._pending_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._pending_path, "a") as f:
            f.write(json.dumps(payload) + "\n")

    def _flush_pending(self) -> bool:
        if not self._pending_path.exists():
            return True

        raw = self._pending_path.read_text()
        lines = [line for line in raw.splitlines() if line.strip()]
        if not lines:
            return True

        remaining: list[str] = []
        all_ok = True
        for line in lines:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Skipping malformed pending entry")
                continue

            if self._post_one(payload):
                logger.info("RoboNet: re-sent pending post")
            else:
                remaining.append(line)
                all_ok = False

        if remaining:
            self._pending_path.write_text("\n".join(remaining) + "\n")
        else:
            self._pending_path.write_text("")

        return all_ok

    def _post_one(self, payload: dict) -> bool:
        url = f"{self.identity.robonet_base_url.rstrip('/')}/episodes"
        headers = {
            "Authorization": f"Bearer {self.identity.api_key}",
            "Content-Type": "application/json",
        }
        try:
            response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
            if response.status_code not in (200, 201):
                logger.warning(
                    f"RoboNet post failed: HTTP {response.status_code}. "
                    "Entry kept in pending buffer."
                )
                return False
            return True
        except Exception as exc:
            logger.warning(f"RoboNet post error: {exc}. Entry kept in pending buffer.")
            return False
