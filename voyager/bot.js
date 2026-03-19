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

// Spread bots 5 blocks apart along X axis based on bot index (1/2/3)
// voyager_bot_1 → offset +0, voyager_bot_2 → +5, voyager_bot_3 → +10
const botIndex = parseInt((username.match(/(\d+)$/) || [0, 1])[1], 10) - 1;
const SPREAD_BLOCKS = 5;

console.log(`[bot.js] Connecting to ${host}:${port} as ${username} (index=${botIndex})`);

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
    const pos = bot.entity.position;
    console.log(`[bot.js] Spawned at ${JSON.stringify(pos)}`);

    if (botIndex > 0) {
      const tx = Math.round(pos.x) + botIndex * SPREAD_BLOCKS;
      const ty = Math.round(pos.y);
      const tz = Math.round(pos.z);
      setTimeout(() => {
        bot.chat(`/tp ${username} ${tx} ${ty} ${tz}`);
        console.log(`[bot.js] Teleported to ${tx} ${ty} ${tz}`);
      }, 1000);
    }
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
