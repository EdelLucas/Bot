// Events werden lokal gespeichert (data/events.json), nicht im Sheet – das Sheet bleibt unverändert.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = path.join(config.dataDir, 'events.json');
let state = {};

try {
  state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  state = {};
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

const guild = (guildId) => (state[guildId] ??= { nextId: 1, events: {} });

function create(guildId, data) {
  const g = guild(guildId);
  const ev = { ...data, ID: g.nextId++ };
  g.events[ev.ID] = ev;
  save();
  return { ...ev, _guild: guildId };
}

function get(guildId, id) {
  const ev = state[guildId]?.events?.[id];
  return ev ? { ...ev, _guild: guildId } : null;
}

function update(guildId, id, changes) {
  const ev = state[guildId]?.events?.[id];
  if (!ev) return null;
  Object.assign(ev, changes);
  save();
  return { ...ev, _guild: guildId };
}

function list(guildId) {
  return Object.values(state[guildId]?.events || {}).map((ev) => ({ ...ev, _guild: guildId }));
}

function guildIds() {
  return Object.keys(state);
}

module.exports = { create, get, update, list, guildIds };
