// Einstellungen pro Discord-Server (Sheet, Ankündigungskanal, Admin-Rolle).
// Werden per /setup gesetzt und in data/servers.json gespeichert.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = path.join(config.dataDir, 'servers.json');
let servers = {};

function load() {
  try {
    servers = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    servers = {};
  }
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(servers, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

/** Einstellungen eines Servers. Für DISCORD_GUILD_ID gelten die Werte aus der .env als Vorgabe. */
function get(guildId) {
  const fallback = guildId && guildId === config.discord.guildId
    ? {
      sheetId: config.sheets.defaultSheetId,
      announceChannelId: config.discord.announceChannelId,
      adminRoleId: config.discord.adminRoleId,
    }
    : {};
  const own = servers[guildId] || {};
  return {
    sheetId: own.sheetId || fallback.sheetId || null,
    announceChannelId: own.announceChannelId || fallback.announceChannelId || null,
    adminRoleId: own.adminRoleId || fallback.adminRoleId || null,
  };
}

function set(guildId, changes) {
  servers[guildId] = { ...servers[guildId], ...changes };
  save();
  return get(guildId);
}

/** IDs aller Server, die ein Sheet eingerichtet haben. */
function configuredGuildIds() {
  const ids = new Set(Object.keys(servers).filter((id) => servers[id].sheetId));
  if (config.discord.guildId && config.sheets.defaultSheetId) ids.add(config.discord.guildId);
  return [...ids];
}

load();

module.exports = { get, set, configuredGuildIds };
