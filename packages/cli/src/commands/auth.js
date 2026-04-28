/**
 * fleetseek auth <subcommand>
 *
 * Subcommands:
 *   login   — authenticate with a FleetSeek API key and save credentials
 */

import { input } from '@inquirer/prompts';
import { readConfig, writeConfig, configPath } from '../config.js';
import { apiGet } from '../api.js';

/**
 * `fleetseek auth login`
 *
 * Prompts for API URL and API key, verifies them against GET /api/v1/agents/me,
 * then persists to ~/.config/fleetseek/config.json.
 */
export async function authLogin() {
  const existing = readConfig();

  console.log('');
  console.log('FleetSeek — authentication setup');
  console.log('─'.repeat(40));

  const api_url = await input({
    message: 'FleetSeek API URL:',
    default: existing.api_url || process.env.FLEETSEEK_API_URL || 'http://localhost:3001'
  });

  const api_key = await input({
    message: 'API key (robonet_...):',
    default: existing.api_key || ''
  });

  if (!api_key || api_key.trim() === '') {
    console.error('Error: API key cannot be empty.');
    process.exit(1);
  }

  console.log('');
  console.log('Verifying credentials...');

  let agent;
  try {
    const data = await apiGet(api_url.trim(), '/api/v1/agents/me', api_key.trim());
    agent = data.agent;
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('Invalid')) {
      console.error('Error: Invalid API key. Please check and try again.');
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }

  writeConfig({
    api_url: api_url.trim(),
    api_key: api_key.trim()
  });

  console.log('');
  console.log(`Logged in as: ${agent.name} (${agent.displayName || agent.name})`);
  console.log(`Config saved to: ${configPath()}`);
  console.log('');
  console.log('Next step: run `fleetseek robot register` to register your G1 robot.');
}
