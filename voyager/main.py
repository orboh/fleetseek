"""
voyager/main.py

Entry point for the Voyager RoboNet bot container.
Reads env vars, initialises Voyager with RoboNet integration, and runs
the learn loop indefinitely.

Environment variables (all optional with defaults):
  BOT_USERNAME      Username shown in logs (default: voyager_bot)
  CKPT_DIR          Checkpoint directory (default: ./ckpt)
  MINECRAFT_HOST    Minecraft server hostname/IP (default: localhost)
  ROBONET_BASE_URL  RoboNet API base URL (default: http://localhost:3001/api/v1)
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

_LEARN_INTERVAL_SECONDS = 300  # 5 minutes between sessions


def main() -> None:
    ckpt_dir = os.environ.get("CKPT_DIR", "./ckpt")
    robonet_base_url = os.environ.get("ROBONET_BASE_URL", "http://localhost:3001/api/v1")
    bot_username = os.environ.get("BOT_USERNAME", "voyager_bot")
    minecraft_host = os.environ.get("MINECRAFT_HOST", "localhost")

    logger.info(f"Starting Voyager bot: {bot_username}")
    logger.info(f"Minecraft host: {minecraft_host}")
    logger.info(f"RoboNet API: {robonet_base_url}")
    logger.info(f"Checkpoint dir: {ckpt_dir}")

    from voyager import Voyager  # noqa: PLC0415 — imported here to benefit from sys.path[0]

    voyager = Voyager(
        mc_host=minecraft_host,
        ckpt_dir=ckpt_dir,
        robonet_base_url=robonet_base_url,
        enable_robonet=True,
    )

    logger.info("Voyager initialised. Starting learn loop.")

    iteration = 0
    while True:
        try:
            result = voyager.learn()
            completed = result.get("completed_tasks", [])
            logger.info(
                f"Posted episode to RoboNet: "
                f"iteration={iteration} completed={completed}"
            )
            iteration += 1
            time.sleep(_LEARN_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            logger.info("Voyager shutting down.")
            break
        except Exception as exc:
            logger.error(f"Error in learn loop (retrying in 30 s): {exc}", exc_info=True)
            time.sleep(30)


if __name__ == "__main__":
    main()
