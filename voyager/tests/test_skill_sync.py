"""Tests for voyager/robonet/skill_sync.py – Phase 5 TDD."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
import respx

sys.path.insert(0, str(Path(__file__).parent.parent))

from robonet.identity import RobotIdentity

BASE_URL = "http://test-api/api/v1"
EPISODES_URL = f"{BASE_URL}/episodes"

IDENTITY = RobotIdentity(
    robot_id="robot-self-001",
    api_key="robonet_testkey_aabbcc",
    agent_id="agent-uuid-001",
    registered_at="2026-03-17T00:00:00Z",
    robonet_base_url=BASE_URL,
)


def make_episode(robot_id: str, skills_code: dict) -> dict:
    return {
        "id": "ep-uuid-001",
        "robot_id": robot_id,
        "voyager_data": {
            "session_id": "sess-abc",
            "skills_acquired": list(skills_code.keys()),
            "skills_code": skills_code,
        },
    }


# ── trusted_robot_ids=[] では同期が実行されない ────────────────────────────


@respx.mock
def test_sync_skipped_when_trusted_ids_empty():
    """trusted_robot_ids=[] のとき同期が実行されない。"""
    from robonet.skill_sync import sync_skills

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=[],
    )
    assert count == 0
    skill_manager.add_new_skill.assert_not_called()
    assert len(respx.calls) == 0


@respx.mock
def test_sync_skipped_when_trusted_ids_none():
    """trusted_robot_ids=None のとき同期が実行されない。"""
    from robonet.skill_sync import sync_skills

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=None,
    )
    assert count == 0
    skill_manager.add_new_skill.assert_not_called()
    assert len(respx.calls) == 0


# ── インポートスキルに robonet_ プレフィックスが付く ────────────────────────


@respx.mock
def test_skill_name_has_robonet_prefix():
    """インポートされたスキルに robonet_ プレフィックスが付く。"""
    from robonet.skill_sync import sync_skills

    trusted_id = "robot-trusted-002"
    skills_code = {"craftWoodenPickaxe": "async function craftWoodenPickaxe(bot) {}"}
    episode = make_episode(trusted_id, skills_code)

    respx.get(EPISODES_URL).mock(
        return_value=httpx.Response(200, json={"data": [episode]})
    )

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=[trusted_id],
    )

    assert count == 1
    skill_manager.add_new_skill.assert_called_once()
    # info は位置引数または keyword 引数 "info=" で渡される
    call_args = skill_manager.add_new_skill.call_args
    info = call_args[0][0] if call_args[0] else call_args[1]["info"]
    assert info["program_name"].startswith("robonet_"), (
        f"Expected robonet_ prefix, got: {info['program_name']}"
    )
    assert "craftWoodenPickaxe" in info["program_name"]


@respx.mock
def test_multiple_trusted_robots_imported():
    """複数の信頼済みロボットからスキルがインポートされる。"""
    from robonet.skill_sync import sync_skills

    trusted_id_1 = "robot-trusted-010"
    trusted_id_2 = "robot-trusted-011"
    episode_1 = make_episode(trusted_id_1, {"mineWood": "function mineWood(bot){}"})
    episode_2 = make_episode(trusted_id_2, {"craftAxe": "function craftAxe(bot){}"})

    respx.get(EPISODES_URL).mock(
        side_effect=[
            httpx.Response(200, json={"data": [episode_1]}),
            httpx.Response(200, json={"data": [episode_2]}),
        ]
    )

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=[trusted_id_1, trusted_id_2],
    )

    assert count == 2
    assert skill_manager.add_new_skill.call_count == 2


# ── 1MB 超のスキルコードはスキップされる ────────────────────────────────


@respx.mock
def test_oversized_skill_is_skipped():
    """1MB 超のスキルコードはスキップされる。"""
    from robonet.skill_sync import sync_skills, MAX_SKILLS_CODE_BYTES

    trusted_id = "robot-trusted-003"
    large_code = "x" * (MAX_SKILLS_CODE_BYTES + 1)
    skills_code = {
        "bigSkill": large_code,
        "smallSkill": "console.log('ok')",
    }
    episode = make_episode(trusted_id, skills_code)

    respx.get(EPISODES_URL).mock(
        return_value=httpx.Response(200, json={"data": [episode]})
    )

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=[trusted_id],
    )

    # bigSkill はスキップ、smallSkill だけインポート
    assert count == 1
    imported_names = [
        (c[0][0] if c[0] else c[1]["info"])["program_name"]
        for c in skill_manager.add_new_skill.call_args_list
    ]
    assert all("bigSkill" not in n for n in imported_names)
    assert any("smallSkill" in n for n in imported_names)


@respx.mock
def test_api_error_returns_zero_for_that_robot():
    """API エラー時はそのロボットのスキルをスキップして 0 を返す。"""
    from robonet.skill_sync import sync_skills

    trusted_id = "robot-trusted-005"
    respx.get(EPISODES_URL).mock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    skill_manager = MagicMock()
    count = sync_skills(
        identity=IDENTITY,
        skill_manager=skill_manager,
        trusted_robot_ids=[trusted_id],
    )

    assert count == 0
    skill_manager.add_new_skill.assert_not_called()


# ── 同期失敗時も __init__() が完了する ─────────────────────────────────────


def test_sync_failure_does_not_crash_init(tmp_path):
    """同期失敗時も Voyager.__init__() が完了する。"""
    from voyager import Voyager

    with (
        patch("robonet.identity.load_or_register") as mock_load,
        patch("robonet.reporter.VoyagerReporter") as mock_reporter_cls,
        patch("robonet.skill_sync.sync_skills", side_effect=RuntimeError("API down")),
    ):
        mock_identity = RobotIdentity(
            robot_id="robot-self-001",
            api_key="key",
            agent_id="agent-001",
            registered_at="2026-03-17T00:00:00Z",
            robonet_base_url=BASE_URL,
        )
        mock_load.return_value = mock_identity
        mock_reporter_cls.return_value = MagicMock()

        # Should not raise even when sync_skills throws
        voyager = Voyager(
            ckpt_dir=str(tmp_path),
            enable_robonet=True,
            sync_skills_on_start=True,
            trusted_robot_ids=["robot-trusted-001"],
        )

    assert voyager is not None
    assert voyager._robonet_enabled is True


# ── Voyager.__init__() に sync_skills_on_start フック ───────────────────


def test_voyager_init_calls_sync_when_enabled(tmp_path):
    """sync_skills_on_start=True かつ trusted_robot_ids ありのとき同期が呼ばれる。"""
    from voyager import Voyager

    trusted_id = "robot-trusted-004"

    with (
        patch("robonet.identity.load_or_register") as mock_load,
        patch("robonet.reporter.VoyagerReporter") as mock_reporter_cls,
        patch("robonet.skill_sync.sync_skills", return_value=3) as mock_sync,
    ):
        mock_identity = RobotIdentity(
            robot_id="robot-self-001",
            api_key="key",
            agent_id="agent-001",
            registered_at="2026-03-17T00:00:00Z",
            robonet_base_url=BASE_URL,
        )
        mock_load.return_value = mock_identity
        mock_reporter_cls.return_value = MagicMock()

        Voyager(
            ckpt_dir=str(tmp_path),
            enable_robonet=True,
            sync_skills_on_start=True,
            trusted_robot_ids=[trusted_id],
        )

        mock_sync.assert_called_once()


def test_voyager_init_skips_sync_when_disabled(tmp_path):
    """sync_skills_on_start=False のとき同期が呼ばれない。"""
    from voyager import Voyager

    with (
        patch("robonet.identity.load_or_register") as mock_load,
        patch("robonet.reporter.VoyagerReporter") as mock_reporter_cls,
        patch("robonet.skill_sync.sync_skills") as mock_sync,
    ):
        mock_identity = RobotIdentity(
            robot_id="robot-self-001",
            api_key="key",
            agent_id="agent-001",
            registered_at="2026-03-17T00:00:00Z",
            robonet_base_url=BASE_URL,
        )
        mock_load.return_value = mock_identity
        mock_reporter_cls.return_value = MagicMock()

        Voyager(
            ckpt_dir=str(tmp_path),
            enable_robonet=True,
            sync_skills_on_start=False,
            trusted_robot_ids=["robot-trusted-001"],
        )

        mock_sync.assert_not_called()
