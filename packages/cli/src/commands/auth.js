/**
 * fleetseek auth login
 *
 * Opens the browser for X OAuth, starts a local HTTP server on port 38333,
 * and waits for the web app to POST the API key back automatically.
 * No copy-paste required.
 */

import http from 'http';
import { exec } from 'child_process';
import { readConfig, writeConfig, configPath } from '../config.js';
import { apiGet } from '../api.js';

const CLI_PORT = 38333;
const WEB_BASE = 'https://web-ebon-zeta-33.vercel.app';
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} "${url}"`, () => {});
}

export async function authLogin() {
  const existing = readConfig();
  const apiUrl = (process.env.FLEETSEEK_API_URL || existing.api_url || 'http://localhost:3001').trim();

  const loginUrl = `${WEB_BASE}/auth/login?cli_port=${CLI_PORT}`;

  console.log('');
  console.log('FleetSeek — Sign in with X');
  console.log('─'.repeat(40));
  console.log('');
  console.log(`Opening browser...`);
  console.log(`  ${loginUrl}`);
  console.log('');
  console.log('Waiting for X login... (Ctrl+C to cancel)');

  openBrowser(loginUrl);

  const apiKey = await waitForCallback(CLI_PORT);

  console.log('');
  console.log('Verifying credentials...');

  let agent;
  try {
    const data = await apiGet(apiUrl, '/api/v1/agents/me', apiKey);
    agent = data.agent;
  } catch (err) {
    if (err.message.includes('401') || err.message.includes('Invalid')) {
      console.error('Error: Invalid API key.');
    } else {
      console.error(`Error: ${err.message}`);
      console.error(`  (type: ${err.name}, apiUrl: ${apiUrl}, keyLen: ${apiKey?.length})`);
    }
    process.exit(1);
  }

  writeConfig({ api_url: apiUrl, api_key: apiKey });

  console.log('');
  console.log(`✓ Logged in as: ${agent.name}`);
  console.log(`  Config saved to: ${configPath()}`);
  console.log('');
  console.log('Next step: run `fleetseek robot register` to register your G1 robot.');
}

function waitForCallback(port) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Login timed out after 5 minutes.'));
    }, TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Private-Network', 'true');
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/callback') {
        const key = url.searchParams.get('api_key')?.trim();
        if (key) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          clearTimeout(timer);
          server.close();
          resolve(key);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing api_key' }));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, '127.0.0.1', () => {});
    server.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start local server on port ${port}: ${err.message}`));
    });
  });
}
