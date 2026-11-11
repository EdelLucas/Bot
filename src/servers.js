// Einstellungen pro Discord-Server: Sheet + Blatt, Ankündigungskanal, Admin-Rolle und
// die Zuordnung Discord-Konto → Spieler-ID. Gespeichert in data/servers.json.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = path.join(config.dataDir, 'servers.json');
let servers = {};

try {
  servers = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  servers = {};
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(servers, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

function get(guildId) {
  const own = servers[guildId] || {};
  const isDefault = guildId && guildId === config.discord.guildId;
  return {
    sheetId: own.sheetId || null,
    tab: own.tab || null,
    announceChannelId: own.announceChannelId || (isDefault ? config.discord.announceChannelId : null),
    adminRoleId: own.adminRoleId || (isDefault ? config.discord.adminRoleId : null),
  };
}

function set(guildId, changes) {
  servers[guildId] = { ...servers[guildId], ...changes };
  save();
  return get(guildId);
}

/** Sheet + Blatt des Servers, oder ein verständlicher Fehler. */
function sheetOf(guildId) {
  const { sheetId, tab } = get(guildId);
  if (!sheetId || !tab) {
    throw new Error('Für diesen Server ist noch keine Liste eingerichtet. Ein Admin muss zuerst `/setup sheet` ausführen.');
  }
  return { sheetId, tab };
}

/** Hinterlegte Spieler-ID eines Discord-Kontos auf diesem Server. */
function getPlayerId(guildId, discordId) {
  return servers[guildId]?.players?.[discordId] ?? null;
}

function setPlayerId(guildId, discordId, playerId) {
  const s = (servers[guildId] ??= {});
  s.players = { ...s.players, [discordId]: String(playerId) };
  save();
}

/** Discord-Konten, die mit einer Spieler-ID verknüpft sind. */
function discordIdsOf(guildId, playerId) {
  return Object.entries(servers[guildId]?.players || {})
    .filter(([, pid]) => pid === String(playerId))
    .map(([did]) => did);
}

/** IDs aller Server, die eine Liste eingerichtet haben. */
function configuredGuildIds() {
  return Object.keys(servers).filter((id) => servers[id].sheetId && servers[id].tab);
}

module.exports = { get, set, sheetOf, getPlayerId, setPlayerId, discordIdsOf, configuredGuildIds };
