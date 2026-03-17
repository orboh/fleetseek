"""Tests for voyager/robonet/identity.py – Phase 3 TDD (Red phase)."""
import json
import os
import sys
import pytest
import httpx
import respx

# Allow importing from voyager/robonet directly
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent))

from robonet.identity import load_or_register, RobotIdentity


BASE_URL = "http://test-api/api/v1"
REGISTER_URL = f"{BASE_URL}/robots/register"


# ── load from existing file ────────────────────────────────────

def test_loads_identity_when_file_exists(tmp_path):
    """identity ファイルが存在する場合、API を呼ばずにロードする。"""
    data = {
        "robot_id": "robot-uuid",
        "api_key": "robonet_testkey_aabbcc",
        "agent_id": "agent-uuid",
        "registered_at": "2026-03-17T00:00:00Z",
        "robonet_base_url": BASE_URL,
    }
    (tmp_path / "robonet_identity.json").write_text(json.dumps(data))

    with respx.mock:
        result = load_or_register(
            ckpt_dir=str(tmp_path),
            robonet_base_url=BASE_URL,
            name="voyager_bot_1",
        )
        assert not respx.calls, "Should not call API when identity file exists"

    assert isinstance(result, RobotIdentity)
    assert result.robot_id == "robot-uuid"
    assert result.api_key == "robonet_testkey_aabbcc"
    assert result.agent_id == "agent-uuid"


# ── register when no file ──────────────────────────────────────

@respx.mock
def test_registers_when_no_identity_file(tmp_path):
    """identity ファイルがない場合、登録 API を呼んで保存する。"""
    respx.post(REGISTER_URL).mock(
        return_value=httpx.Response(
            201,
            json={"robot_id": "new-robot-uuid", "api_key": "robonet_newkey", "agent_id": "new-agent-uuid"},
        )
    )

    result = load_or_register(
        ckpt_dir=str(tmp_path),
        robonet_base_url=BASE_URL,
        name="voyager_bot_1",
    )

    assert result is not None
    assert result.robot_id == "new-robot-uuid"
    assert result.api_key == "robonet_newkey"

    identity_file = tmp_path / "robonet_identity.json"
    assert identity_file.exists(), "Identity file should be saved after registration"
    saved = json.loads(identity_file.read_text())
    assert saved["robot_id"] == "new-robot-uuid"


# ── error handling ─────────────────────────────────────────────

@respx.mock
def test_returns_none_on_registration_failure(tmp_path):
    """登録失敗時は例外を上げず None を返す。"""
    respx.post(REGISTER_URL).mock(side_effect=httpx.ConnectError("Connection refused"))

    result = load_or_register(
        ckpt_dir=str(tmp_path),
        robonet_base_url=BASE_URL,
        name="voyager_bot_1",
    )

    assert result is None, "Should return None on registration failure, not raise"


@respx.mock
def test_returns_none_on_http_error_response(tmp_path):
    """API が 5xx を返した場合も None を返す。"""
    respx.post(REGISTER_URL).mock(return_value=httpx.Response(500, json={"error": "server error"}))

    result = load_or_register(
        ckpt_dir=str(tmp_path),
        robonet_base_url=BASE_URL,
        name="voyager_bot_1",
    )

    assert result is None


# ── env var priority ───────────────────────────────────────────

def test_env_var_takes_priority_over_registration(tmp_path, monkeypatch):
    """ROBONET_API_KEY が設定されている場合、登録 API を呼ばない。"""
    monkeypatch.setenv("ROBONET_API_KEY", "robonet_env_key")
    monkeypatch.setenv("ROBONET_ROBOT_ID", "env-robot-id")
    monkeypatch.setenv("ROBONET_AGENT_ID", "env-agent-id")

    with respx.mock:
        result = load_or_register(
            ckpt_dir=str(tmp_path),
            robonet_base_url=BASE_URL,
            name="voyager_bot_1",
        )
        assert not respx.calls, "Should not call API when ROBONET_API_KEY is set"

    assert result is not None
    assert result.api_key == "robonet_env_key"
    assert result.robot_id == "env-robot-id"


def test_env_var_api_key_without_robot_id_falls_through(tmp_path, monkeypatch):
    """ROBONET_API_KEY のみ（ROBONET_ROBOT_ID なし）でも None にならない。"""
    monkeypatch.setenv("ROBONET_API_KEY", "robonet_env_key")
    monkeypatch.delenv("ROBONET_ROBOT_ID", raising=False)
    monkeypatch.delenv("ROBONET_AGENT_ID", raising=False)

    with respx.mock as mock:
        mock.post(REGISTER_URL).mock(
            return_value=httpx.Response(
                201,
                json={"robot_id": "api-robot-id", "api_key": "robonet_env_key", "agent_id": "api-agent-id"},
            )
        )
        result = load_or_register(
            ckpt_dir=str(tmp_path),
            robonet_base_url=BASE_URL,
            name="voyager_bot_1",
        )

    # When only API key is set but no robot_id, we still register to get robot_id
    # but use the env API key
    assert result is not None
