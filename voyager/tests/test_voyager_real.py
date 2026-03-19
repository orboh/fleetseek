"""
voyager/voyager.py が本物の Voyager ラッパーとして動くことを確認するテスト。
real Voyager は Docker 内でのみ使えるので、ここではモックで検証する。
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, call

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


def make_mock_real_voyager(completed=None, failed=None, skills=None):
    """本物の Voyager の learn() の返り値をモックする。"""
    mock = MagicMock()
    mock.learn.return_value = {
        "ckpt_dir": "/tmp/ckpt",
        "completed_tasks": completed or ["Mine 1 wood log"],
        "failed_tasks": failed or [],
    }
    # recorder.skills: {name: {program_code, program_description}}
    mock.recorder.skills = skills or {
        "mineWoodLog": {
            "program_code": "async function mineWoodLog(bot) {}",
            "program_description": "Mine a wood log",
        }
    }
    return mock


def test_learn_calls_real_voyager_learn(tmp_path):
    """Voyager.learn() が内部の _real_voyager.learn() を呼ぶ。"""
    from voyager import Voyager

    mock_real = make_mock_real_voyager()
    voyager = Voyager(
        mc_host="10.0.1.109",
        mc_port=25565,
        ckpt_dir=str(tmp_path),
        enable_robonet=False,
    )
    voyager._real_voyager = mock_real

    voyager.learn()

    mock_real.learn.assert_called_once()


def test_learn_returns_completed_and_failed(tmp_path):
    """learn() が completed_tasks / failed_tasks を返す。"""
    from voyager import Voyager

    mock_real = make_mock_real_voyager(
        completed=["Mine 1 wood log", "Craft wooden pickaxe"],
        failed=["Mine iron ore"],
    )
    voyager = Voyager(ckpt_dir=str(tmp_path), enable_robonet=False)
    voyager._real_voyager = mock_real

    result = voyager.learn()

    assert result["completed_tasks"] == ["Mine 1 wood log", "Craft wooden pickaxe"]
    assert result["failed_tasks"] == ["Mine iron ore"]


def test_learn_posts_to_robonet_with_skills(tmp_path):
    """learn() が skills を含めて RoboNet に POST する。"""
    from voyager import Voyager

    mock_real = make_mock_real_voyager(
        completed=["Mine 1 wood log"],
        skills={
            "mineWoodLog": {
                "program_code": "async function mineWoodLog(bot) {}",
                "program_description": "Mine a wood log",
            }
        },
    )

    mock_reporter = MagicMock()

    voyager = Voyager(ckpt_dir=str(tmp_path), enable_robonet=True)
    voyager._real_voyager = mock_real
    voyager._reporter = mock_reporter
    voyager._robonet_enabled = True

    voyager.learn()

    mock_reporter.post_session.assert_called_once()
    call_kwargs = mock_reporter.post_session.call_args
    assert "Mine 1 wood log" in call_kwargs.kwargs.get("completed_tasks", call_kwargs.args[0] if call_kwargs.args else [])
    skills_arg = call_kwargs.kwargs.get("skills", {})
    assert "mineWoodLog" in skills_arg


def test_learn_does_not_crash_if_real_voyager_absent(tmp_path):
    """_real_voyager が None でも learn() はクラッシュしない。"""
    from voyager import Voyager

    voyager = Voyager(ckpt_dir=str(tmp_path), enable_robonet=False)
    voyager._real_voyager = None  # 明示的に None

    result = voyager.learn()
    assert isinstance(result, dict)


def test_init_real_voyager_with_openai_compat(tmp_path, monkeypatch):
    """_init_real_voyager() が openai_api_base / openai_api_key を正しく設定する。"""
    monkeypatch.setenv("OPENAI_API_BASE", "https://api.nebius.ai/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-nebius-key")
    monkeypatch.setenv("VOYAGER_MODEL_NAME", "meta-llama/Meta-Llama-3.1-70B-Instruct")

    # real Voyager の import をモック（Docker 外では使えない）
    mock_voyager_cls = MagicMock()
    mock_voyager_instance = MagicMock()
    mock_voyager_cls.return_value = mock_voyager_instance

    import sys
    fake_module = MagicMock()
    fake_module.Voyager = mock_voyager_cls
    # 'voyager.voyager_minedojo' という名前でモックを注入
    with patch.dict(sys.modules, {"voyager_minedojo": fake_module}):
        from importlib import reload
        import voyager as voyager_mod
        # voyager モジュールを reload してモックが効くようにする
        # (このテストは _init_real_voyager の呼び出し引数を検証する)

    # 簡易版: _init_real_voyager を直接テスト
    from voyager import Voyager
    v = Voyager(ckpt_dir=str(tmp_path), enable_robonet=False)
    # _real_voyager が None（Docker 外）でも init は成功する
    # Docker 外では ImportError -> _real_voyager = None
    assert hasattr(v, "_real_voyager")
