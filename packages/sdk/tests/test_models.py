"""Tests for EpisodeCreateRequest with voyager_data."""
import pytest
from robonet_sdk.models import EpisodeCreateRequest


def _minimal_request(**kwargs) -> EpisodeCreateRequest:
    defaults = dict(
        robot_id="robot-1",
        task_name="box_stacking",
        task_category="manipulation",
        success=True,
        completion_rate=1.0,
        lerobot_path="./data/ep_001",
        fps=30,
        modalities=["rgb_head"],
        title="Test episode",
        description="Test description",
    )
    defaults.update(kwargs)
    return EpisodeCreateRequest(**defaults)


def test_voyager_data_none_by_default():
    req = _minimal_request()
    assert req.voyager_data is None


def test_voyager_data_included_in_to_dict_when_set():
    vd = {
        "session_id": "sess-1",
        "skills_acquired": ["craft_wooden_pickaxe"],
        "skills_code": {"craft_wooden_pickaxe": "async function..."},
        "tasks_completed": ["Mine 1 wood log"],
    }
    req = _minimal_request(voyager_data=vd)
    payload = req.to_dict()
    assert payload["voyager_data"] == vd


def test_voyager_data_not_in_to_dict_when_none():
    req = _minimal_request()
    payload = req.to_dict()
    assert "voyager_data" not in payload
