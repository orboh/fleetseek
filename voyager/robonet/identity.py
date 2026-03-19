"""
voyager/robonet/identity.py

RobotIdentity dataclass and load_or_register() function.
Handles first-boot registration with RoboNet and local persistence.

Security:
  - Identity file contains api_key in plaintext → must be in .gitignore
  - ROBONET_API_KEY env var takes priority over registration
"""

from __future__ import annotations

import json
import logging
import os
import socket
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_IDENTITY_FILENAME = "robonet_identity.json"


@dataclass
class RobotIdentity:
    robot_id: str
    api_key: str
    agent_id: str
    registered_at: str
    robonet_base_url: str


def load_or_register(
    ckpt_dir: str,
    robonet_base_url: str,
    name: str = "",
    display_name: str = "",
    model: str = "voyager-minecraft",
    sim_only: bool = True,
    description: str = "Minecraft LLM lifelong learning agent",
) -> Optional[RobotIdentity]:
    """
    Load identity from file or register with RoboNet.

    Priority order:
    1. ROBONET_API_KEY + ROBONET_ROBOT_ID env vars → skip API call
    2. ROBONET_API_KEY only → register to get robot_id, use env api_key
    3. {ckpt_dir}/robonet_identity.json exists → load from file
    4. Not found → register with RoboNet API and save

    Returns None if registration fails (learning continues without RoboNet).
    """
    identity_path = Path(ckpt_dir) / _IDENTITY_FILENAME

    # Priority 1 & 2: ROBONET_API_KEY env var
    env_api_key = os.environ.get("ROBONET_API_KEY")
    if env_api_key:
        env_robot_id = os.environ.get("ROBONET_ROBOT_ID")
        env_agent_id = os.environ.get("ROBONET_AGENT_ID", "")
        if env_robot_id:
            # Both key and robot_id set → no API call needed
            logger.info("RoboNet: using identity from environment variables")
            return RobotIdentity(
                robot_id=env_robot_id,
                api_key=env_api_key,
                agent_id=env_agent_id,
                registered_at=datetime.now(timezone.utc).isoformat(),
                robonet_base_url=robonet_base_url,
            )
        # Only API key set → register to get robot_id
        logger.info("RoboNet: ROBONET_API_KEY set but no ROBONET_ROBOT_ID, registering to get robot_id")
        result = _call_register_api(
            robonet_base_url=robonet_base_url,
            name=name or _default_name(),
            display_name=display_name,
            model=model,
            sim_only=sim_only,
            description=description,
        )
        if result is None:
            return None
        # Override api_key with env var
        identity = RobotIdentity(
            robot_id=result["robot_id"],
            api_key=env_api_key,
            agent_id=result.get("agent_id", ""),
            registered_at=datetime.now(timezone.utc).isoformat(),
            robonet_base_url=robonet_base_url,
        )
        _save(identity_path, identity)
        return identity

    # Priority 3: identity file exists
    if identity_path.exists():
        logger.info(f"RoboNet: loading identity from {identity_path}")
        return _load(identity_path)

    # Priority 4: register with RoboNet API
    logger.info("RoboNet: no identity found, registering with RoboNet")
    effective_name = name or _default_name()
    result = _call_register_api(
        robonet_base_url=robonet_base_url,
        name=effective_name,
        display_name=display_name,
        model=model,
        sim_only=sim_only,
        description=description,
    )
    if result is None:
        return None

    identity = RobotIdentity(
        robot_id=result["robot_id"],
        api_key=result["api_key"],
        agent_id=result.get("agent_id", ""),
        registered_at=datetime.now(timezone.utc).isoformat(),
        robonet_base_url=robonet_base_url,
    )
    _save(identity_path, identity)
    return identity


# ── internal helpers ───────────────────────────────────────────────────────────


def _default_name() -> str:
    return f"voyager_{socket.gethostname()}"


def _load(path: Path) -> RobotIdentity:
    data = json.loads(path.read_text())
    return RobotIdentity(
        robot_id=data["robot_id"],
        api_key=data["api_key"],
        agent_id=data.get("agent_id", ""),
        registered_at=data.get("registered_at", ""),
        robonet_base_url=data.get("robonet_base_url", ""),
    )


def _save(path: Path, identity: RobotIdentity) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(identity), indent=2))
    logger.info(f"RoboNet: identity saved to {path}")


def _call_register_api(
    robonet_base_url: str,
    name: str,
    display_name: str,
    model: str,
    sim_only: bool,
    description: str,
) -> Optional[dict]:
    """Call POST /robots/register. Returns response dict or None on failure."""
    url = f"{robonet_base_url.rstrip('/')}/robots/register"
    payload = {
        "name": name,
        "display_name": display_name,
        "model": model,
        "sim_only": sim_only,
        "description": description,
    }
    try:
        response = httpx.post(url, json=payload, timeout=10.0)
        if response.status_code not in (200, 201):
            logger.warning(
                f"RoboNet registration failed: HTTP {response.status_code}. "
                "Learning will continue without RoboNet."
            )
            return None
        return response.json()
    except Exception as exc:
        logger.warning(
            f"RoboNet registration error: {exc}. Learning will continue without RoboNet."
        )
        return None
