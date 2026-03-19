/**
 * bot.js — mineflayer bot that connects to the Minecraft server.
 *
 * Env vars:
 *   MINECRAFT_HOST   Minecraft server IP/hostname (default: localhost)
 *   MINECRAFT_PORT   Minecraft server port (default: 25565)
 *   BOT_USERNAME     Bot username (default: voyager_bot)
 */

const mineflayer = require('mineflayer');

const host = process.env.MINECRAFT_HOST || 'localhost';
const port = parseInt(process.env.MINECRAFT_PORT || '25565', 10);
const username = process.env.BOT_USERNAME || 'voyager_bot';

console.log(`[bot.js] Connecting to ${host}:${port} as ${username}`);

function createBot() {
  const bot = mineflayer.createBot({
    host,
    port,
    username,
    auth: 'offline',
    version: '1.19',
  });

  bot.once('login', () => {
    console.log(`[bot.js] Logged in as ${bot.username}`);
  });

  bot.once('spawn', () => {
    console.log(`[bot.js] Spawned at ${JSON.stringify(bot.entity.position)}`);
  });

  bot.on('error', (err) => {
    console.error(`[bot.js] Error: ${err.message}`);
  });

  bot.on('kicked', (reason) => {
    console.warn(`[bot.js] Kicked: ${reason}. Reconnecting in 10s...`);
    setTimeout(createBot, 10000);
  });

  bot.on('end', (reason) => {
    console.warn(`[bot.js] Disconnected (${reason}). Reconnecting in 10s...`);
    setTimeout(createBot, 10000);
  });

  // Keep-alive: send a chat message every 5 minutes to avoid AFK kick
  const KEEPALIVE_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    if (bot.entity) {
      bot.chat('/ping');
    }
  }, KEEPALIVE_INTERVAL);
}

createBot();
