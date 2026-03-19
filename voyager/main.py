"""
voyager/main.py

Entry point for the Voyager RoboNet bot container.

Environment variables:
  BOT_USERNAME          Username shown in logs (default: voyager_bot)
  CKPT_DIR              Checkpoint directory (default: ./ckpt)
  MINECRAFT_HOST        Minecraft server hostname/IP (default: localhost)
  MINECRAFT_PORT        Minecraft server port (default: 25565)
  ROBONET_BASE_URL      RoboNet API base URL (default: http://localhost:3001/api/v1)
  OPENAI_API_BASE       OpenAI-compatible base URL (e.g., Nebius endpoint)
  OPENAI_API_KEY        API key (or set NEBIUS_API_KEY)
  NEBIUS_API_KEY        Nebius API key (alias for OPENAI_API_KEY)
  VOYAGER_MODEL_NAME    LLM model name (default: gpt-4)
  VOYAGER_MAX_ITER      Max iterations per learn() session (default: 160)
  LEARN_INTERVAL        Seconds between learn() sessions (default: 300)
"""
from __future__ import annotations

import logging
import os
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


def _configure_openai() -> None:
    """Set up OpenAI-compatible API (Nebius etc.) from environment variables."""
    api_base = os.environ.get("OPENAI_API_BASE") or os.environ.get("NEBIUS_BASE_URL")
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("NEBIUS_API_KEY")

    if api_base:
        os.environ["OPENAI_API_BASE"] = api_base
        logger.info(f"OpenAI API base: {api_base}")
    if api_key:
        os.environ["OPENAI_API_KEY"] = api_key
        logger.info("OpenAI API key set from environment.")


def main() -> None:
    _configure_openai()

    ckpt_dir = os.environ.get("CKPT_DIR", "./ckpt")
    robonet_base_url = os.environ.get("ROBONET_BASE_URL", "http://localhost:3001/api/v1")
    bot_username = os.environ.get("BOT_USERNAME", "voyager_bot")
    minecraft_host = os.environ.get("MINECRAFT_HOST", "localhost")
    minecraft_port = int(os.environ.get("MINECRAFT_PORT", "25565"))
    model_name = os.environ.get("VOYAGER_MODEL_NAME", "gpt-4")
    max_iterations = int(os.environ.get("VOYAGER_MAX_ITER", "160"))
    learn_interval = int(os.environ.get("LEARN_INTERVAL", "300"))

    logger.info(f"Starting Voyager bot: {bot_username}")
    logger.info(f"Minecraft: {minecraft_host}:{minecraft_port}")
    logger.info(f"RoboNet API: {robonet_base_url}")
    logger.info(f"Model: {model_name}, max_iterations: {max_iterations}")
    logger.info(f"Checkpoint dir: {ckpt_dir}")

    from voyager import Voyager

    voyager = Voyager(
        mc_host=minecraft_host,
        mc_port=minecraft_port,
        ckpt_dir=ckpt_dir,
        robonet_base_url=robonet_base_url,
        enable_robonet=True,
        action_agent_model_name=model_name,
        curriculum_agent_model_name=model_name,
        critic_agent_model_name=model_name,
        skill_manager_model_name=model_name,
        max_iterations=max_iterations,
    )

    logger.info("Voyager initialised. Starting learn loop.")

    iteration = 0
    while True:
        try:
            result = voyager.learn()
            completed = result.get("completed_tasks", [])
            logger.info(
                f"Learn session complete: iteration={iteration} completed={completed}"
            )
            iteration += 1
            time.sleep(learn_interval)
        except KeyboardInterrupt:
            logger.info("Voyager shutting down.")
            break
        except Exception as exc:
            logger.error(f"Error in learn loop (retrying in 30s): {exc}", exc_info=True)
            time.sleep(30)


if __name__ == "__main__":
    main()
