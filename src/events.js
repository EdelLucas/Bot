// Ablauf eines Events: Start → Anwesenheit im Call erfassen → Ende → Teilnahmen in der Liste hochzählen.
const { EmbedBuilder } = require('discord.js');
const sheets = require('./sheets');
const servers = require('./servers');
const store = require('./eventstore');
const tracker = require('./tracker');
const config = require('./config');
const { discordTs, money, minutes, clip } = require('./format');

const EVENT = { GEPLANT: 'Geplant', LAEUFT: 'Läuft', BEENDET: 'Beendet', ABGEBROCHEN: 'Abgebrochen' };

/** Eindeutiger Schlüssel für die Call-Erfassung (Event-IDs gelten nur pro Server). */
const trackKey = (ev) => `${ev._guild}:${ev.ID}`;
const eventTitle = (ev) => ev.titel || ev.art;

async function postTo(client, channelId, payload) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send(payload).catch((err) => {
    console.error(`Konnte nicht in Kanal ${channelId} posten:`, err.message);
    return null;
  });
}

/** Mindestzeit im Call (ms), um die Teilnahme gutgeschrieben zu bekommen. */
function minAttendanceMs(ev, durationMs) {
  if (ev.minMinuten != null && ev.minMinuten !== '') return Number(ev.minMinuten) * 60_000;
  return (durationMs * config.payout.minPercent) / 100;
}

/**
 * Findet den Spieler in der Liste zu einem Discord-Nutzer:
 * 1. per /id hinterlegte Spieler-ID, 2. Discord-Name = Name in der Liste, 3. ID steht im Discord-Namen.
 */
function resolvePlayer(liste, guildId, user) {
  const linked = liste.byId(servers.getPlayerId(guildId, user.id));
  if (linked) return linked;
  const byName = liste.byName(user.name);
  if (byName) return byName;
  const ids = String(user.name).match(/\d{2,}/g) || [];
  return ids.map((id) => liste.byId(id)).find(Boolean) || null;
}

const starting = new Set();

/** Startet die Call-Erfassung für ein Event. */
async function startEvent(client, ev) {
  const key = trackKey(ev);
  if (tracker.get(key) || starting.has(key)) throw new Error(`Event #${ev.ID} läuft bereits.`);
  starting.add(key);
  try {
    const channel = await client.channels.fetch(String(ev.voiceId)).catch(() => null);
    if (!channel?.isVoiceBased()) throw new Error(`Voice-Kanal von Event #${ev.ID} nicht gefunden.`);
    if (channel.guild.id !== ev._guild) throw new Error('Der Voice-Kanal gehört zu einem anderen Server.');
    const t = tracker.start(key, channel);
    store.update(ev._guild, ev.ID, { status: EVENT.LAEUFT });

    await postTo(client, ev.postId, {
      content:
        `▶️ **${eventTitle(ev)}** hat begonnen! Kommt in ${channel} – eure Zeit im Call wird erfasst.` +
        (ev.dauer ? `\nEnde ${discordTs(t.startedAt + ev.dauer * 60_000, 'R')}.` : ''),
    });
    return Object.keys(t.users).length;
  } finally {
    starting.delete(key);
  }
}

/** Beendet ein Event, wertet den Call aus und zählt die Teilnahmen in der Liste hoch. */
async function endEvent(client, ev) {
  const snap = tracker.stop(trackKey(ev));
  if (!snap) throw new Error(`Event #${ev.ID} wird gerade nicht erfasst.`);

  const minMs = minAttendanceMs(ev, snap.durationMs);
  const sorted = snap.users.sort((a, b) => b.ms - a.ms);
  const qualified = sorted.filter((u) => u.ms >= minMs && u.ms > 0);
  const tooShort = sorted.filter((u) => !qualified.includes(u));

  const { sheetId, tab } = servers.sheetOf(ev._guild);
  const liste = await sheets.load(sheetId, tab);
  const matched = [];
  const unmatched = [];
  for (const u of qualified) {
    const p = resolvePlayer(liste, ev._guild, u);
    if (p && !matched.some((m) => m.player.row === p.row)) matched.push({ user: u, player: p });
    else if (!p) unmatched.push(u);
  }

  const { event: column } = await sheets.addEventCounts(sheetId, tab, ev.art, matched.map((m) => ({ row: m.player.row })));
  store.update(ev._guild, ev.ID, {
    status: EVENT.BEENDET,
    teilnehmer: matched.length,
    pending: unmatched.map((u) => u.id), // werden nachgetragen, sobald /id setzen gemacht wird
  });

  const lines = matched.map(({ user, player }) =>
    `\`${player.id ?? '—'}\` ${player.name} (<@${user.id}>) – ${minutes(user.ms)} Min – +${money(column.amount)}`);
  if (unmatched.length) {
    lines.push('', '**Nicht in der Liste gefunden:**');
    unmatched.forEach((u) => lines.push(`⚠️ <@${u.id}> – ${minutes(u.ms)} Min`));
  }
  if (tooShort.length) {
    lines.push('', `**Zu kurz im Call** (unter ${minutes(minMs)} Min):`);
    tooShort.forEach((u) => lines.push(`❌ <@${u.id}> – ${minutes(u.ms)} Min`));
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🏁 ${eventTitle(ev)} ist beendet`)
    .setDescription(clip(lines.length ? lines : ['Niemand war im Call.']))
    .addFields(
      { name: 'Dauer', value: `${minutes(snap.durationMs)} Min`, inline: true },
      { name: 'Eingetragen', value: `${matched.length}× „${column.name}“`, inline: true },
      { name: 'Gesamt', value: money(column.amount * matched.length), inline: true },
    )
    .setFooter({ text: `Event #${ev.ID} · in der Liste „${tab}“ eingetragen` });

  const content = unmatched.length
    ? `${unmatched.map((u) => `<@${u.id}>`).join(' ')} – ihr wurdet in der Liste nicht gefunden. ` +
      'Verknüpft euch mit `/id setzen`, dann wird die Teilnahme automatisch nachgetragen.'
    : undefined;
  await postTo(client, ev.postId, { content, embeds: [embed], allowedMentions: { users: unmatched.map((u) => u.id) } });
  return { embed, matched, unmatched, tooShort };
}

/** Trägt offene Teilnahmen nach, nachdem sich jemand mit /id setzen verknüpft hat. */
async function creditPending(guildId, discordId) {
  const { sheetId, tab } = servers.sheetOf(guildId);
  const playerId = servers.getPlayerId(guildId, discordId);
  const done = [];
  for (const ev of store.list(guildId)) {
    if (!ev.pending?.includes(discordId)) continue;
    const { event, credited } = await sheets.addEventCounts(sheetId, tab, ev.art, [playerId]);
    if (!credited.length) continue; // Spieler-ID steht (noch) nicht in der Liste
    store.update(guildId, ev.ID, { pending: ev.pending.filter((id) => id !== discordId), teilnehmer: (ev.teilnehmer || 0) + 1 });
    done.push({ ev, event });
  }
  return done;
}

async function cancelEvent(ev) {
  tracker.stop(trackKey(ev));
  store.update(ev._guild, ev.ID, { status: EVENT.ABGEBROCHEN });
}

/** Startet/beendet fällige Events eines Servers. */
async function tickGuild(client, guildId) {
  const now = Date.now();
  for (const ev of store.list(guildId)) {
    const dauerMs = (Number(ev.dauer) || 0) * 60_000;
    if (ev.status === EVENT.GEPLANT && ev.start <= now) {
      // nicht nachträglich starten, wenn der Bot während des ganzen Events offline war
      if (now - ev.start > (dauerMs || 6 * 3600_000)) continue;
      await startEvent(client, ev).catch((e) => console.error(`Auto-Start #${ev.ID}:`, e.message));
    } else if (ev.status === EVENT.LAEUFT) {
      const t = tracker.get(trackKey(ev));
      if (!t) {
        console.warn(`Event #${ev.ID} läuft, aber ohne Erfassung (Tracking-Datei fehlt) – starte neu.`);
        const channel = await client.channels.fetch(String(ev.voiceId)).catch(() => null);
        if (channel?.isVoiceBased()) tracker.start(trackKey(ev), channel);
      } else if (dauerMs && t.startedAt + dauerMs <= now) {
        await endEvent(client, ev).catch((e) => console.error(`Auto-Ende #${ev.ID}:`, e.message));
      }
    }
  }
}

/** Prüft jede Minute, ob Events automatisch gestartet oder beendet werden müssen. */
function startScheduler(client) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const guildId of store.guildIds()) {
        if (!client.guilds.cache.has(guildId)) continue;
        await tickGuild(client, guildId).catch((e) => console.error(`Zeitplaner (Server ${guildId}):`, e.message));
      }
    } finally {
      busy = false;
    }
  };
  tick();
  setInterval(tick, 60_000);
}

module.exports = {
  EVENT, trackKey, eventTitle, startEvent, endEvent, cancelEvent, creditPending,
  resolvePlayer, startScheduler, minAttendanceMs, postTo,
};
