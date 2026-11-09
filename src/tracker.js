// Erfasst, wer wie lange in einem Voice-Call ist. Der Zustand wird in einer JSON-Datei
// gespeichert, damit ein Neustart des Bots die bisherige Anwesenheit nicht verliert.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const FILE = config.trackingFile;
// state.events[eventId] = { guildId, channelId, startedAt, users: { [userId]: { name, total, joinedAt } } }
let state = { savedAt: Date.now(), events: {} };

function load() {
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    /* noch keine Datei */
  }
}

function save() {
  state.savedAt = Date.now();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
}

function join(t, member, now) {
  const u = (t.users[member.id] ??= { name: member.displayName, total: 0, joinedAt: null });
  u.name = member.displayName;
  if (u.joinedAt == null) u.joinedAt = now;
}

function leave(t, userId, now) {
  const u = t.users[userId];
  if (u && u.joinedAt != null) {
    u.total += Math.max(0, now - u.joinedAt);
    u.joinedAt = null;
  }
}

/** Startet die Erfassung; alle, die schon im Call sind, zählen ab jetzt. */
function start(eventId, channel) {
  const now = Date.now();
  const t = { guildId: channel.guild.id, channelId: channel.id, startedAt: now, users: {} };
  for (const m of channel.members.values()) if (!m.user.bot) join(t, m, now);
  state.events[String(eventId)] = t;
  save();
  return t;
}

function get(eventId) {
  return state.events[String(eventId)] || null;
}

/** Wird bei jedem voiceStateUpdate aufgerufen (Join, Leave, Kanalwechsel). */
function handleVoiceUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot || oldState.channelId === newState.channelId) return;
  const now = Date.now();
  let changed = false;
  for (const t of Object.values(state.events)) {
    if (t.guildId !== newState.guild.id) continue;
    if (oldState.channelId === t.channelId) { leave(t, member.id, now); changed = true; }
    if (newState.channelId === t.channelId) { join(t, member, now); changed = true; }
  }
  if (changed) save();
}

/** Aktueller Stand, ohne die Erfassung zu beenden. */
function snapshot(eventId, now = Date.now()) {
  const t = get(eventId);
  if (!t) return null;
  return {
    startedAt: t.startedAt,
    channelId: t.channelId,
    durationMs: now - t.startedAt,
    users: Object.entries(t.users).map(([id, u]) => ({
      id,
      name: u.name,
      ms: u.total + (u.joinedAt != null ? now - u.joinedAt : 0),
      present: u.joinedAt != null,
    })),
  };
}

/** Beendet die Erfassung und gibt das Ergebnis zurück (synchron → kein doppeltes Beenden möglich). */
function stop(eventId) {
  const snap = snapshot(eventId);
  if (!snap) return null;
  delete state.events[String(eventId)];
  save();
  return snap;
}

/**
 * Nach einem Neustart: offene Sitzungen zum Zeitpunkt der letzten Speicherung schließen
 * und alle, die jetzt im Call sind, neu erfassen.
 */
async function resync(client) {
  const lastAlive = state.savedAt || Date.now();
  const now = Date.now();
  for (const t of Object.values(state.events)) {
    for (const userId of Object.keys(t.users)) leave(t, userId, Math.min(lastAlive, now));
    const channel = await client.channels.fetch(t.channelId).catch(() => null);
    if (channel?.members) for (const m of channel.members.values()) if (!m.user.bot) join(t, m, now);
  }
  save();
  // regelmäßig speichern, damit "savedAt" aktuell bleibt
  setInterval(() => { if (Object.keys(state.events).length) save(); }, 60_000).unref();
}

load();

module.exports = { start, get, stop, snapshot, handleVoiceUpdate, resync };
