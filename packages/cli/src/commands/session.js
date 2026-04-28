/**
 * fleetseek session <subcommand>
 *
 * Subcommands:
 *   start   — display session info and env variable guidance (stub for MVP-alpha)
 */

import { readConfig } from '../config.js';

/**
 * `fleetseek session start`
 *
 * Reads the robot_id from config and prints guidance on how to set the
 * FLEETSEEK_ROBOT_ID environment variable for Claude Code integration.
 * Actual SDK session management is deferred to a future milestone.
 */
export function sessionStart() {
  const { api_url, api_key, robot_id } = readConfig();

  if (!api_url || !api_key) {
    console.error(
      'Error: Not authenticated. Please run `fleetseek auth login` first.'
    );
    process.exit(1);
  }

  if (!robot_id) {
    console.error(
      'Error: No robot registered. Please run `fleetseek robot register` first.'
    );
    process.exit(1);
  }

  console.log('');
  console.log('FleetSeek セッション開始。');
  console.log(`  robot_id : ${robot_id}`);
  console.log(`  api_url  : ${api_url}`);
  console.log('');
  console.log('── Claude Code 環境変数の設定方法 ──────────────────────────');
  console.log('');
  console.log('  次のコマンドをターミナルで実行し、Claude Code セッションを起動してください:');
  console.log('');
  console.log(`  export FLEETSEEK_ROBOT_ID=${robot_id}`);
  console.log(`  export FLEETSEEK_API_URL=${api_url}`);
  console.log('');
  console.log('  または .env ファイルに追記:');
  console.log('');
  console.log(`  FLEETSEEK_ROBOT_ID=${robot_id}`);
  console.log(`  FLEETSEEK_API_URL=${api_url}`);
  console.log('');
  console.log('────────────────────────────────────────────────────────────');
  console.log('');
  console.log('Note: SDK integration (actual session lifecycle management) is');
  console.log('      planned for a future milestone. This is a stub for MVP-alpha.');
}
