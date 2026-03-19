"""
voyager/voyager.py

Voyager wrapper with RoboNet integration.
Wraps the real MineDojo/Voyager when available, falls back to stub.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class Voyager:
    """
    RoboNet-integrated wrapper around the real MineDojo Voyager.

    If the real Voyager package is not installed (e.g., in tests),
    _real_voyager is None and learn() runs in stub mode.

    RoboNet-specific args:
        robonet_base_url: RoboNet API base URL.
        enable_robonet: Whether to post sessions to RoboNet.
        sync_skills_on_start: Import trusted robot skills on init.
        trusted_robot_ids: Whitelist for skill sync.

    Voyager args (passed through to real Voyager):
        mc_host: Minecraft server host.
        mc_port: Minecraft server port.
        ckpt_dir: Checkpoint directory.
        openai_api_key: OpenAI (or compatible) API key.
        action_agent_model_name: Model for action agent.
        curriculum_agent_model_name: Model for curriculum agent.
        critic_agent_model_name: Model for critic agent.
        skill_manager_model_name: Model for skill manager.
        max_iterations: Max iterations per learn() call.
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
        openai_api_key: Optional[str] = None,
        action_agent_model_name: Optional[str] = None,
        curriculum_agent_model_name: Optional[str] = None,
        critic_agent_model_name: Optional[str] = None,
        skill_manager_model_name: Optional[str] = None,
        max_iterations: int = 160,
        **kwargs,
    ) -> None:
        self.ckpt_dir = ckpt_dir
        self._robonet_enabled = False
        self._reporter = None
        self._real_voyager = None

        self._init_real_voyager(
            mc_host=mc_host,
            mc_port=mc_port,
            ckpt_dir=ckpt_dir,
            openai_api_key=openai_api_key,
            action_agent_model_name=action_agent_model_name,
            curriculum_agent_model_name=curriculum_agent_model_name,
            critic_agent_model_name=critic_agent_model_name,
            skill_manager_model_name=skill_manager_model_name,
            max_iterations=max_iterations,
        )

        if enable_robonet:
            self._init_robonet(
                robonet_base_url=robonet_base_url,
                sync_skills_on_start=sync_skills_on_start,
                trusted_robot_ids=trusted_robot_ids,
            )

    # ── Real Voyager initialisation ─────────────────────────────────────────

    def _init_real_voyager(
        self,
        mc_host: str,
        mc_port: int,
        ckpt_dir: str,
        openai_api_key: Optional[str],
        action_agent_model_name: Optional[str],
        curriculum_agent_model_name: Optional[str],
        critic_agent_model_name: Optional[str],
        skill_manager_model_name: Optional[str],
        max_iterations: int,
    ) -> None:
        """Instantiate the real MineDojo Voyager if installed."""
        # Configure OpenAI-compatible endpoint (Nebius etc.)
        api_base = os.environ.get("OPENAI_API_BASE")
        api_key = openai_api_key or os.environ.get("OPENAI_API_KEY") or os.environ.get("NEBIUS_API_KEY")
        model = (
            action_agent_model_name
            or os.environ.get("VOYAGER_MODEL_NAME")
            or "gpt-4"
        )

        try:
            # Patch openai before importing real Voyager
            import openai
            if api_base:
                openai.api_base = api_base
                logger.info(f"OpenAI API base set to: {api_base}")
            if api_key:
                openai.api_key = api_key

            # Import real Voyager (installed in Docker via pip install git+...)
            # Use sys.path manipulation to avoid importing ourselves (circular import).
            import sys
            _self_path = next(
                (p for p in sys.path if p.endswith("/app/voyager") or p.endswith("/app/voyager/")),
                None,
            )
            if _self_path:
                sys.path.remove(_self_path)
            try:
                import voyager as _real_voyager_module  # type: ignore[import]
                RealVoyager = _real_voyager_module.Voyager
            finally:
                if _self_path:
                    sys.path.insert(0, _self_path)

            self._real_voyager = RealVoyager(
                mc_host=mc_host,
                mc_port=mc_port,
                ckpt_dir=ckpt_dir,
                openai_api_key=api_key or "",
                action_agent_model_name=model,
                curriculum_agent_model_name=curriculum_agent_model_name or model,
                curriculum_agent_qa_model_name=model,
                critic_agent_model_name=critic_agent_model_name or model,
                skill_manager_model_name=skill_manager_model_name or model,
                max_iterations=max_iterations,
                resume=True,  # pick up from previous checkpoint
            )
            logger.info(f"Real Voyager initialised: {mc_host}:{mc_port}, model={model}")

        except ImportError:
            logger.warning(
                "MineDojo Voyager not installed — running in stub mode. "
                "In production, install via: pip install git+https://github.com/MineDojo/Voyager.git"
            )
        except Exception as exc:
            logger.warning(f"Failed to initialise real Voyager (stub mode): {exc}")

    # ── RoboNet initialisation ──────────────────────────────────────────────

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

            try:
                self._reporter.flush_pending()
            except Exception as exc:
                logger.warning(f"RoboNet: flush_pending failed (non-fatal): {exc}")

            try:
                self._reporter.start_heartbeat_loop()
            except Exception as exc:
                logger.warning(f"RoboNet: heartbeat start failed (non-fatal): {exc}")

            if sync_skills_on_start and trusted_robot_ids:
                try:
                    from robonet.skill_sync import sync_skills
                    skill_manager = getattr(self._real_voyager, "skill_manager", None)
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

    # ── Learn loop ──────────────────────────────────────────────────────────

    def learn(self, reset_env: bool = True) -> dict:
        """Run a Voyager learning session and post results to RoboNet.

        Delegates to the real MineDojo Voyager when installed.
        Falls back to stub mode otherwise.
        """
        if self._real_voyager is not None:
            return self._learn_real(reset_env=reset_env)
        return self._learn_stub()

    def _learn_real(self, reset_env: bool = True) -> dict:
        """Delegate to the real MineDojo Voyager's learn() and post to RoboNet."""
        try:
            result = self._real_voyager.learn(reset_env=reset_env) or {}
        except Exception as exc:
            logger.error(f"Real Voyager learn() failed: {exc}", exc_info=True)
            result = {}

        completed_tasks: list[str] = result.get("completed_tasks", [])
        failed_tasks: list[str] = result.get("failed_tasks", [])

        # Extract skills from recorder
        skills: dict = {}
        try:
            recorder = getattr(self._real_voyager, "recorder", None)
            if recorder is not None:
                raw_skills = getattr(recorder, "skills", {})
                if isinstance(raw_skills, dict):
                    skills = raw_skills
        except Exception as exc:
            logger.warning(f"Could not extract skills from recorder: {exc}")

        self._post_to_robonet(completed_tasks=completed_tasks, failed_tasks=failed_tasks, skills=skills)

        return {
            "completed_tasks": completed_tasks,
            "failed_tasks": failed_tasks,
        }

    def _learn_stub(self) -> dict:
        """Stub mode: no real Voyager available."""
        logger.warning("Running in stub mode — no real Voyager learning.")
        self._post_to_robonet(completed_tasks=[], failed_tasks=[], skills={})
        return {"completed_tasks": [], "failed_tasks": []}

    def _post_to_robonet(
        self,
        completed_tasks: list[str],
        failed_tasks: list[str],
        skills: dict,
    ) -> None:
        if not (self._robonet_enabled and self._reporter is not None):
            return
        try:
            total_iterations = None
            if self._real_voyager is not None:
                recorder = getattr(self._real_voyager, "recorder", None)
                if recorder is not None:
                    total_iterations = getattr(recorder, "iteration", None)

            self._reporter.post_session(
                completed_tasks=completed_tasks,
                failed_tasks=failed_tasks,
                skills=skills,
                total_iterations=total_iterations,
            )
        except Exception as exc:
            logger.warning(f"RoboNet post failed (non-fatal): {exc}")
