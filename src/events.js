// Ablauf eines Events: Start → Anwesenheit im Call erfassen → Ende → Auszahlungen eintragen.
const { EmbedBuilder } = require('discord.js');
const sheets = require('./sheets');
const { byId, PAYOUT, EVENT } = sheets;
const tracker = require('./tracker');
const config = require('./config');
const servers = require('./servers');
const { formatDate, discordTs, money, minutes, clip } = require('./format');

/** Eindeutiger Schlüssel für die Call-Erfassung (Event-IDs gelten nur pro Server). */
const trackKey = (ev) => `${ev._guild}:${ev.ID}`;

/** Liest ein Event; `_guild` merkt sich, zu welchem Discord-Server es gehört. */
async function getEvent(guildId, id) {
  const tables = await sheets.forGuild(guildId);
  const ev = (await tables.events.find(byId(id)))[0];
  return ev ? { ...ev, _guild: guildId } : null;
}

const tablesOf = (ev) => sheets.forGuild(ev._guild);

async function postTo(client, channelId, payload) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.send(payload).catch((err) => {
    console.error(`Konnte nicht in Kanal ${channelId} posten:`, err.message);
    return null;
  });
}

/** Mindestzeit im Call (ms), um ausgezahlt zu werden. */
function minAttendanceMs(ev, durationMs) {
  if (ev['Min. Minuten'] !== '' && ev['Min. Minuten'] != null) return Number(ev['Min. Minuten']) * 60_000;
  return (durationMs * config.payout.minPercent) / 100;
}

const starting = new Set();

/** Startet die Call-Erfassung für ein Event. */
async function startEvent(client, ev) {
  const id = String(ev.ID);
  const key = trackKey(ev);
  if (tracker.get(key) || starting.has(key)) throw new Error(`Event #${id} läuft bereits.`);
  starting.add(key);
  try {
    const channel = await client.channels.fetch(String(ev['Voice-Kanal-ID'])).catch(() => null);
    if (!channel?.isVoiceBased()) throw new Error(`Voice-Kanal von Event #${id} nicht gefunden.`);
    if (channel.guild.id !== ev._guild) throw new Error('Der Voice-Kanal gehört zu einem anderen Server.');
    const t = tracker.start(key, channel);
    await (await tablesOf(ev)).events.update(byId(id), { Status: EVENT.LAEUFT });

    const dauer = Number(ev['Dauer (Min)']) || 0;
    await postTo(client, ev['Post-Kanal-ID'], {
      content:
        `▶️ **${ev.Name}** hat begonnen! Kommt in ${channel} – eure Zeit im Call wird für die Auszahlung erfasst.` +
        (dauer ? `\nEnde ${discordTs(t.startedAt + dauer * 60_000, 'R')}.` : ''),
    });
    return Object.keys(t.users).length;
  } finally {
    starting.delete(key);
  }
}

/** Beendet ein Event, wertet den Call aus und trägt die Auszahlungen ins Sheet ein. */
async function endEvent(client, ev, endedBy = 'Automatisch') {
  const id = String(ev.ID);
  const snap = tracker.stop(trackKey(ev));
  if (!snap) throw new Error(`Event #${id} wird gerade nicht erfasst.`);

  const minMs = minAttendanceMs(ev, snap.durationMs);
  const sorted = snap.users.sort((a, b) => b.ms - a.ms);
  const qualified = sorted.filter((u) => u.ms >= minMs && u.ms > 0);
  const tooShort = sorted.filter((u) => !qualified.includes(u));

  const tables = await tablesOf(ev);
  const players = await tables.spieler.readAll();
  const playerIds = new Map(players.map((p) => [String(p['Discord-ID']), String(p['Spieler-ID'])]));
  const summe = Number(ev.Summe) || 0;
  const datum = formatDate();

  const rows = qualified.map((u) => {
    const spielerId = playerIds.get(u.id) || '';
    return {
      Datum: datum,
      'Event-ID': ev.ID,
      Event: ev.Name,
      'Spieler-ID': spielerId,
      'Discord-Name': u.name,
      'Discord-ID': u.id,
      Summe: summe,
      'Anwesenheit (Min)': minutes(u.ms),
      Status: spielerId ? PAYOUT.OFFEN : PAYOUT.ID_FEHLT,
      Quelle: 'Automatisch (Call)',
      'Eingetragen von': endedBy,
    };
  });
  await tables.auszahlungen.addMany(rows);
  await tables.events.update(byId(id), { Status: EVENT.BEENDET, Teilnehmer: rows.length });

  const lines = rows.map((r) =>
    `${r['Spieler-ID'] ? `\`${r['Spieler-ID']}\`` : '⚠️ **ID fehlt**'} <@${r['Discord-ID']}> – ${r['Anwesenheit (Min)']} Min – ${money(r.Summe)}`);
  if (tooShort.length) {
    lines.push('', `**Zu kurz im Call** (unter ${minutes(minMs)} Min):`);
    tooShort.forEach((u) => lines.push(`❌ <@${u.id}> – ${minutes(u.ms)} Min`));
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`🏁 ${ev.Name} ist beendet`)
    .setDescription(clip(lines.length ? lines : ['Niemand war im Call.']))
    .addFields(
      { name: 'Dauer', value: `${minutes(snap.durationMs)} Min`, inline: true },
      { name: 'Ausgezahlt', value: `${rows.length} Teilnehmer`, inline: true },
      { name: 'Gesamt', value: money(summe * rows.length), inline: true },
    )
    .setFooter({ text: `Event #${id} · Auszahlungen stehen im Sheet (Status "Offen")` });

  const missing = rows.filter((r) => !r['Spieler-ID']);
  const content = missing.length
    ? `${missing.map((r) => `<@${r['Discord-ID']}>`).join(' ')} – bitte hinterlegt eure Spieler-ID mit \`/id setzen\`, ` +
      'dann wird sie automatisch in eure Auszahlung eingetragen.'
    : undefined;

  await postTo(client, ev['Post-Kanal-ID'], {
    content,
    embeds: [embed],
    allowedMentions: { users: missing.map((r) => String(r['Discord-ID'])) },
  });
  return { embed, rows, tooShort };
}

async function cancelEvent(ev) {
  tracker.stop(trackKey(ev));
  await (await tablesOf(ev)).events.update(byId(ev.ID), { Status: EVENT.ABGEBROCHEN });
}

/** Startet/beendet fällige Events eines Servers. */
async function tickGuild(client, guildId) {
  const now = Date.now();
  const tables = await sheets.forGuild(guildId);
  for (const row of await tables.events.readAll()) {
    const ev = { ...row, _guild: guildId };
    const id = String(ev.ID);
    const startMs = Number(ev['Start (Unix)']) * 1000;
    const dauerMs = (Number(ev['Dauer (Min)']) || 0) * 60_000;

    if (ev.Status === EVENT.GEPLANT && startMs <= now) {
      // nicht nachträglich starten, wenn der Bot während des ganzen Events offline war
      if (now - startMs > (dauerMs || 6 * 3600_000)) continue;
      await startEvent(client, ev).catch((e) => console.error(`Auto-Start #${id}:`, e.message));
    } else if (ev.Status === EVENT.LAEUFT) {
      const t = tracker.get(trackKey(ev));
      if (!t) {
        console.warn(`Event #${id} läuft, aber ohne Erfassung (Tracking-Datei fehlt) – starte neu.`);
        const channel = await client.channels.fetch(String(ev['Voice-Kanal-ID'])).catch(() => null);
        if (channel?.isVoiceBased()) tracker.start(trackKey(ev), channel);
      } else if (dauerMs && t.startedAt + dauerMs <= now) {
        await endEvent(client, ev).catch((e) => console.error(`Auto-Ende #${id}:`, e.message));
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
      for (const guildId of servers.configuredGuildIds()) {
        if (!client.guilds.cache.has(guildId)) continue; // Bot ist nicht (mehr) auf dem Server
        await tickGuild(client, guildId).catch((e) => console.error(`Scheduler (Server ${guildId}):`, e.message));
      }
    } catch (err) {
      console.error('Scheduler-Fehler:', err.message);
    } finally {
      busy = false;
    }
  };
  tick();
  setInterval(tick, 60_000);
}

module.exports = { trackKey, getEvent, startEvent, endEvent, cancelEvent, startScheduler, minAttendanceMs, postTo };
