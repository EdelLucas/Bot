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

const guild = (guildId) => {
  const g = (state[guildId] ??= {});
  g.nextId ??= 1;
  g.events ??= {};
  g.series ??= {};
  g.nextSeriesId ??= 1;
  return g;
};

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

// ---- Regelmäßige Events (Serien) ----
function createSeries(guildId, data) {
  const g = guild(guildId);
  const serie = { ...data, ID: g.nextSeriesId++ };
  g.series[serie.ID] = serie;
  save();
  return serie;
}

function listSeries(guildId) {
  return Object.values(state[guildId]?.series || {});
}

function updateSeries(guildId, id, changes) {
  const serie = state[guildId]?.series?.[id];
  if (!serie) return null;
  Object.assign(serie, changes);
  save();
  return serie;
}

function deleteSeries(guildId, id) {
  const serie = state[guildId]?.series?.[id];
  if (!serie) return null;
  delete state[guildId].series[id];
  save();
  return serie;
}

// ---- Automatische Auszahlungsliste ----
function getPayoutPlan(guildId) {
  return state[guildId]?.payoutPlan || null;
}

function setPayoutPlan(guildId, plan) {
  guild(guildId).payoutPlan = plan;
  save();
}

module.exports = {
  create, get, update, list, guildIds,
  createSeries, listSeries, updateSeries, deleteSeries, getPayoutPlan, setPayoutPlan,
};
