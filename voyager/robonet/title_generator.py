"""
voyager/robonet/title_generator.py

Generate a human-readable title for a Voyager session.
Falls back to a hash-based title when generation fails.
"""
from __future__ import annotations

import hashlib
import logging

logger = logging.getLogger(__name__)

_MAX_TASK_DISPLAY = 2


def generate_title(
    completed_tasks: list[str],
    failed_tasks: list[str],
    skills: dict,
) -> str:
    """Return a short title summarising the session.

    Falls back to a deterministic hash-based title so the caller can
    always rely on a non-empty return value.
    """
    try:
        return _make_title(completed_tasks, failed_tasks, skills)
    except Exception as exc:  # pragma: no cover
        logger.warning(f"Title generation failed ({exc}), using fallback")
        return _fallback_title(completed_tasks, failed_tasks)


def _make_title(
    completed_tasks: list[str],
    failed_tasks: list[str],
    skills: dict,
) -> str:
    if completed_tasks:
        snippet = ", ".join(completed_tasks[:_MAX_TASK_DISPLAY])
        extra = len(completed_tasks) - _MAX_TASK_DISPLAY
        if extra > 0:
            snippet += f" +{extra} more"
        return f"Voyager: {snippet}"

    new_skills = list(skills.keys())[:_MAX_TASK_DISPLAY]
    if new_skills:
        return f"Voyager learned: {', '.join(new_skills)}"

    return _fallback_title(completed_tasks, failed_tasks)


def _fallback_title(completed_tasks: list[str], failed_tasks: list[str]) -> str:
    content = "|".join(sorted(completed_tasks + failed_tasks))
    h = hashlib.sha256(content.encode()).hexdigest()[:8]
    return f"Voyager session {h}"
