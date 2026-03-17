"""Tests for RoboNetClient.register_robot and get_episodes."""
import pytest
import httpx
import respx

from robonet_sdk.client import RoboNetClient


BASE_URL = "http://test-api/api/v1"


# ── register_robot ────────────────────────────────────────────

@respx.mock
def test_register_robot_sends_name_and_model():
    """register_robot() は name / model / sim_only を /robots/register に POST する。"""
    route = respx.post(f"{BASE_URL}/robots/register").mock(
        return_value=httpx.Response(
            200,
            json={"robot_id": "uuid-1", "api_key": "robonet_testkey", "agent_id": "agent-1"},
        )
    )

    result = RoboNetClient.register_robot(
        base_url=BASE_URL,
        name="voyager_bot_1",
        model="voyager",
        sim_only=True,
    )

    assert route.called
    request_body = route.calls.last.request
    import json
    body = json.loads(request_body.content)
    assert body["name"] == "voyager_bot_1"
    assert body["model"] == "voyager"
    assert body["sim_only"] is True
    assert result["api_key"] == "robonet_testkey"
    assert result["robot_id"] == "uuid-1"


@respx.mock
def test_register_robot_default_params():
    """register_robot() のデフォルトパラメータが正しい。"""
    route = respx.post(f"{BASE_URL}/robots/register").mock(
        return_value=httpx.Response(
            200,
            json={"robot_id": "uuid-2", "api_key": "robonet_abc", "agent_id": "agent-2"},
        )
    )

    RoboNetClient.register_robot(base_url=BASE_URL, name="bot")

    import json
    body = json.loads(route.calls.last.request.content)
    assert body["model"] == "unknown"
    assert body["sim_only"] is False
    assert body["display_name"] == ""
    assert body["description"] == ""


# ── get_episodes ──────────────────────────────────────────────

@respx.mock
def test_get_episodes_sends_robot_id_and_limit():
    """get_episodes(robot_id, limit) は正しいクエリパラメータを送る。"""
    route = respx.get(f"{BASE_URL}/episodes").mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    client = RoboNetClient(api_key="robonet_testkey", base_url=BASE_URL)
    client.get_episodes(robot_id="robot-42", limit=5)

    assert route.called
    url = str(route.calls.last.request.url)
    assert "robot_id=robot-42" in url
    assert "limit=5" in url


@respx.mock
def test_get_episodes_default_params():
    """get_episodes() のデフォルトパラメータが正しい。"""
    route = respx.get(f"{BASE_URL}/episodes").mock(
        return_value=httpx.Response(200, json={"data": []})
    )

    client = RoboNetClient(api_key="robonet_testkey", base_url=BASE_URL)
    client.get_episodes()

    url = str(route.calls.last.request.url)
    assert "sort=new" in url
    assert "limit=20" in url
