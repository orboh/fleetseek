/**
 * Config persistence for FleetSeek CLI.
 * Stored at ~/.config/fleetseek/config.json via the `conf` package.
 */

import Conf from 'conf';

const store = new Conf({
  projectName: 'fleetseek',
  projectSuffix: '',
  // `conf` uses ~/.config/fleetseek/config.json on Linux
  schema: {
    api_url: { type: 'string' },
    api_key: { type: 'string' },
    robot_id: { type: 'string' }
  }
});

/**
 * Read the full config object.
 * @returns {{ api_url?: string, api_key?: string, robot_id?: string }}
 */
export function readConfig() {
  return {
    api_url: store.get('api_url'),
    api_key: store.get('api_key'),
    robot_id: store.get('robot_id')
  };
}

/**
 * Write a partial config update (merges with existing values).
 * @param {{ api_url?: string, api_key?: string, robot_id?: string }} values
 */
export function writeConfig(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) {
      store.set(key, value);
    }
  }
}

/** Return the filesystem path to the config file for display purposes. */
export function configPath() {
  return store.path;
}
