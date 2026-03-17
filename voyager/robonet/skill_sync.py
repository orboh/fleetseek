"""
voyager/robonet/skill_sync.py

sync_skills(): RoboNet から信頼済みロボットのスキルを取得して
ChromaDB (skill_manager) にインポートする。

Security:
  - trusted_robot_ids が空または None の場合は同期を実行しない
  - 1MB 超のスキルコードはインポートしない（読み込み側ガード）
  - インポートスキルには "robonet_" プレフィックスを付与して
    ローカルスキルとの名前衝突を防ぐ
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from .identity import RobotIdentity

logger = logging.getLogger(__name__)

MAX_SKILLS_CODE_BYTES = 1 * 1024 * 1024  # 1MB


def sync_skills(
    identity: RobotIdentity,
    skill_manager,  # duck-typed: has add_new_skill(info: dict) method
    trusted_robot_ids: Optional[list[str]],
    limit: int = 50,
) -> int:
    """RoboNet から信頼済みロボットのスキルを取得して skill_manager にインポートする。

    Args:
        identity: 認証情報（api_key, robonet_base_url を含む）
        skill_manager: add_new_skill(info=dict) メソッドを持つオブジェクト
        trusted_robot_ids: スキルを取得するロボット ID のホワイトリスト
        limit: 各ロボットから取得するエピソード上限

    Returns:
        インポートしたスキル数

    Note:
        trusted_robot_ids が空または None の場合は 0 を返して即座に終了する。
        skill_manager が None の場合も同様に 0 を返す。
    """
    if not trusted_robot_ids:
        return 0

    if skill_manager is None:
        logger.warning("RoboNet: no skill_manager available, skipping skill sync")
        return 0

    imported = 0
    for robot_id in trusted_robot_ids:
        episodes = _fetch_episodes(identity=identity, robot_id=robot_id, limit=limit)
        for episode in episodes:
            skills_code = (episode.get("voyager_data") or {}).get("skills_code", {})
            if not isinstance(skills_code, dict):
                continue

            for skill_name, code in skills_code.items():
                if not isinstance(code, str):
                    logger.warning(
                        f"Skipping skill '{skill_name}': code is not a string"
                    )
                    continue

                if len(code.encode("utf-8")) > MAX_SKILLS_CODE_BYTES:
                    logger.warning(
                        f"Skipping skill '{skill_name}' from robot {robot_id}: "
                        "code size exceeds 1MB"
                    )
                    continue

                skill_manager.add_new_skill(info={
                    "program_name": f"robonet_{skill_name}",
                    "program_code": code,
                    "program_description": f"Imported from robot {robot_id}",
                })
                imported += 1

    return imported


def _fetch_episodes(
    identity: RobotIdentity,
    robot_id: str,
    limit: int = 50,
) -> list[dict]:
    """GET /api/v1/episodes?robot_id=...&sort=top&limit=... を呼ぶ。"""
    url = f"{identity.robonet_base_url.rstrip('/')}/episodes"
    headers = {
        "Authorization": f"Bearer {identity.api_key}",
        "Accept": "application/json",
    }
    params = {"robot_id": robot_id, "sort": "top", "limit": limit}

    try:
        response = httpx.get(url, params=params, headers=headers, timeout=30.0)
        if response.status_code != 200:
            logger.warning(
                f"RoboNet: failed to fetch episodes for robot {robot_id}: "
                f"HTTP {response.status_code}"
            )
            return []
        data = response.json()
        return data.get("data", [])
    except Exception as exc:
        logger.warning(
            f"RoboNet: error fetching episodes for robot {robot_id}: {exc}"
        )
        return []
