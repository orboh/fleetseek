/**
 * fleetseek robot <subcommand>
 *
 * Subcommands:
 *   register   — register a physical G1 robot and obtain a FleetSeek L1 ID
 */

import { input, confirm } from '@inquirer/prompts';
import { readConfig, writeConfig } from '../config.js';
import { apiPost } from '../api.js';

/**
 * `fleetseek robot register`
 *
 * Prompts for robot model / serial number, calls POST /api/v1/robots/register,
 * then saves the returned fleetseek_id as robot_id in the local config.
 */
export async function robotRegister() {
  const { api_url, api_key } = readConfig();

  if (!api_url || !api_key) {
    console.error(
      'Error: Not authenticated. Please run `fleetseek auth login` first.'
    );
    process.exit(1);
  }

  console.log('');
  console.log('FleetSeek — robot registration');
  console.log('─'.repeat(40));
  console.log('Register a physical robot to obtain its FleetSeek L1 ID (rbt_...).');
  console.log('');

  const model = await input({
    message: 'Robot model:',
    default: 'unitree_g1'
  });

  const serial_number = await input({
    message: 'Serial number (optional, press Enter to skip):'
  });

  const manufacturer = await input({
    message: 'Manufacturer (optional):',
    default: 'Unitree'
  });

  console.log('');
  console.log('Registering robot...');

  let robot;
  try {
    const payload = {
      model: model.trim(),
      manufacturer: manufacturer.trim() || undefined,
      serial_number: serial_number.trim() || undefined
    };

    const data = await apiPost(api_url, '/api/v1/robots/register', api_key, payload);
    robot = data.robot;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const fleetseekId = robot.fleetseek_id;
  writeConfig({ robot_id: fleetseekId });

  console.log('');
  console.log('Robot registered successfully.');
  console.log(`  FleetSeek ID : ${fleetseekId}`);
  console.log(`  Model        : ${robot.model}`);
  if (robot.serial_number) {
    console.log(`  Serial       : ${robot.serial_number}`);
  }
  console.log('');
  console.log('robot_id saved to config. Run `fleetseek session start` to begin a session.');
}
