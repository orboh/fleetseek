"""
voyager/voyager.py

Voyager class with RoboNet integration hooks.

In production this wraps (or subclasses) the real Voyager implementation.
The RoboNet-specific logic lives in voyager/robonet/ and is injected here
as a non-fatal side-effect of learn().
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from typing import Optional

logger = logging.getLogger(__name__)


class Voyager:
    """Voyager lifelong-learning agent with optional RoboNet integration.

    RoboNet-related args (all optional, default off):
        mc_host: Minecraft server hostname/IP.
        mc_port: Minecraft server port.
        robonet_base_url: API base URL.
        enable_robonet: Whether to post sessions to RoboNet.
        sync_skills_on_start: (Phase 5) import trusted robot skills on init.
        trusted_robot_ids: (Phase 5) whitelist for skill sync.
    """

    def __init__(
        self,
        mc_host: str = "localhost",
        mc_port: int = 25565,
        ckpt_dir: str = "./ckpt",
        robonet_base_url: str = "http://localhost:3001/api/v1",
        enable_robonet: bool = False,
        sync_skills_on_start: bool = False,
        trusted_robot_ids: Optional[list[str]] = None,
        **kwargs,
    ) -> None:
        self.ckpt_dir = ckpt_dir
        self._robonet_enabled = False
        self._reporter = None
        self._bot_proc: Optional[subprocess.Popen] = None

        self._start_minecraft_bot(mc_host=mc_host, mc_port=mc_port)

        if enable_robonet:
            self._init_robonet(
                robonet_base_url=robonet_base_url,
                sync_skills_on_start=sync_skills_on_start,
                trusted_robot_ids=trusted_robot_ids,
            )

    def _start_minecraft_bot(self, mc_host: str, mc_port: int) -> None:
        """Launch bot.js as a subprocess to connect to the Minecraft server."""
        bot_script = os.path.join(os.path.dirname(__file__), "bot.js")
        if not os.path.exists(bot_script):
            logger.warning(f"bot.js not found at {bot_script}, skipping Minecraft connection.")
            return

        bot_username = os.environ.get("BOT_USERNAME", "voyager_bot")
        env = os.environ.copy()
        env["MINECRAFT_HOST"] = mc_host
        env["MINECRAFT_PORT"] = str(mc_port)
        env["BOT_USERNAME"] = bot_username

        # Ensure mineflayer can be found (global npm install goes to /usr/lib/node_modules)
        node_path = env.get("NODE_PATH", "")
        global_node_modules = "/usr/lib/node_modules"
        if global_node_modules not in node_path:
            env["NODE_PATH"] = f"{global_node_modules}:{node_path}".rstrip(":")

        try:
            self._bot_proc = subprocess.Popen(
                ["node", bot_script],
                env=env,
                stdout=sys.stdout,
                stderr=sys.stderr,
            )
            logger.info(f"Minecraft bot started (pid={self._bot_proc.pid}) -> {mc_host}:{mc_port}")
        except Exception as exc:
            logger.warning(f"Failed to start Minecraft bot: {exc}")

    def _init_robonet(
        self,
        robonet_base_url: str,
        sync_skills_on_start: bool = False,
        trusted_robot_ids: Optional[list[str]] = None,
    ) -> None:
        try:
            from robonet.identity import load_or_register
            from robonet.reporter import VoyagerReporter

            identity = load_or_register(
                ckpt_dir=self.ckpt_dir,
                robonet_base_url=robonet_base_url,
            )
            if identity is None:
                logger.warning("RoboNet: registration failed. Running without RoboNet.")
                return

            self._reporter = VoyagerReporter(identity=identity, ckpt_dir=self.ckpt_dir)
            self._robonet_enabled = True

            # Re-send any buffered posts from previous sessions
            try:
                self._reporter.flush_pending()
            except Exception as exc:
                logger.warning(f"RoboNet: flush_pending failed (non-fatal): {exc}")

            # Phase 6-B: start heartbeat background thread
            try:
                self._reporter.start_heartbeat_loop()
            except Exception as exc:
                logger.warning(f"RoboNet: heartbeat start failed (non-fatal): {exc}")

            # Phase 5: Sync skills from trusted robots on startup
            if sync_skills_on_start and trusted_robot_ids:
                try:
                    from robonet.skill_sync import sync_skills
                    skill_manager = getattr(self, "skill_manager", None)
                    count = sync_skills(
                        identity=identity,
                        skill_manager=skill_manager,
                        trusted_robot_ids=trusted_robot_ids,
                    )
                    logger.info(f"RoboNet: imported {count} skills from trusted robots")
                except Exception as exc:
                    logger.warning(f"RoboNet: skill sync failed (non-fatal): {exc}")

        except Exception as exc:
            logger.warning(f"RoboNet: init failed (non-fatal): {exc}")

    def learn(
        self,
        completed_tasks: Optional[list[str]] = None,
        failed_tasks: Optional[list[str]] = None,
        skills: Optional[dict] = None,
    ) -> dict:
        """Run a learning session and post results to RoboNet.

        In the real Voyager implementation, the actual learning loop runs
        here. This stub captures the contract: RoboNet errors must not
        affect the return value.
        """
        completed_tasks = completed_tasks or []
        failed_tasks = failed_tasks or []
        skills = skills or {}

        # ── RoboNet post hook ────────────────────────────────────────────
        # Non-fatal: exceptions are caught so the return value is unaffected.
        if self._robonet_enabled and self._reporter is not None:
            try:
                total_iterations = getattr(
                    getattr(self, "recorder", None), "iteration", None
                )
                self._reporter.post_session(
                    completed_tasks=completed_tasks,
                    failed_tasks=failed_tasks,
                    skills=skills,
                    total_iterations=total_iterations,
                )
            except Exception as exc:
                logger.warning(f"RoboNet post failed (non-fatal): {exc}")

        return {
            "completed_tasks": completed_tasks,
            "failed_tasks": failed_tasks,
        }
