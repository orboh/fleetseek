"""CLI for RoboNet Posting Agent.

Usage:
    robonet-post single <episode_dir> [options]
    robonet-post batch <base_dir> [options]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from robonet_sdk import RoboNetClient

from robonet_posting_agent.poster import EpisodePoster, PostConfig
from robonet_posting_agent.reader import LeRobotReader


def create_parser() -> argparse.ArgumentParser:
    """Create argument parser."""
    parser = argparse.ArgumentParser(
        prog="robonet-post",
        description="Post LeRobot episodes to RoboNet",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("ROBONET_API_KEY"),
        help="RoboNet API key (default: $ROBONET_API_KEY)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("ROBONET_API_URL", "http://localhost:3001/api/v1"),
        help="RoboNet API URL (default: $ROBONET_API_URL or http://localhost:3001/api/v1)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Single episode
    single = subparsers.add_parser("single", help="Post a single episode")
    single.add_argument("episode_dir", help="Path to LeRobot episode directory")
    _add_episode_args(single)

    # Batch post
    batch = subparsers.add_parser("batch", help="Post all episodes from a directory")
    batch.add_argument("base_dir", help="Directory containing episode subdirectories")
    batch.add_argument("--limit", type=int, help="Max episodes to post")
    _add_episode_args(batch)

    return parser


def _add_episode_args(parser: argparse.ArgumentParser) -> None:
    """Add common episode arguments to a subparser."""
    parser.add_argument("--robot-id", required=True, help="Robot identifier")
    parser.add_argument("--task-category", help="Task category (auto-detected if omitted)")
    parser.add_argument("--success", type=_parse_bool, default=True, help="Task success (true/false)")
    parser.add_argument("--completion-rate", type=float, default=1.0, help="Completion rate [0-1]")
    parser.add_argument("--failure-reason", help="Failure reason")
    parser.add_argument("--title", help="Episode title (auto-generated if omitted)")
    parser.add_argument("--description", help="Episode description (auto-generated if omitted)")
    parser.add_argument("--tags", nargs="*", help="Tags (auto-generated if omitted)")


def _parse_bool(value: str) -> bool:
    """Parse boolean string."""
    if value.lower() in ("true", "1", "yes", "y"):
        return True
    if value.lower() in ("false", "0", "no", "n"):
        return False
    raise argparse.ArgumentTypeError(f"Invalid boolean value: {value}")


def main(argv: list[str] | None = None) -> None:
    """CLI entry point."""
    parser = create_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if not args.api_key:
        print("Error: API key required. Set ROBONET_API_KEY or use --api-key.", file=sys.stderr)
        sys.exit(1)

    client = RoboNetClient(api_key=args.api_key, base_url=args.api_url)
    poster = EpisodePoster(client=client)

    config = PostConfig(
        robot_id=args.robot_id,
        task_category=args.task_category,
        success=args.success,
        completion_rate=args.completion_rate,
        failure_reason=args.failure_reason,
        title=args.title,
        description=args.description,
        tags=args.tags,
    )

    try:
        if args.command == "single":
            result = poster.post(args.episode_dir, config)
            print(f"Posted episode: {result.episode_id}")
            print(f"  Post ID: {result.post_id}")
            if result.hf_repo:
                print(f"  HF Repo: {result.hf_repo}")

        elif args.command == "batch":
            results = poster.post_batch(args.base_dir, config, limit=args.limit)
            print(f"Posted {len(results)} episodes:")
            for r in results:
                print(f"  - {r.episode_id}")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        client.close()


if __name__ == "__main__":
    main()
