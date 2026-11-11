const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const sheets = require('../sheets');
const { byId, EVENT } = sheets;
const servers = require('../servers');
const { denyUnlessAdmin } = require('../permissions');
const { parseDateTime, formatDate, discordTs, money, minutes, clip } = require('../format');
const events = require('../events');
const tracker = require('../tracker');
const config = require('../config');

const eventOption = (o) => o.setName('event').setDescription('Welches Event?').setRequired(true).setAutocomplete(true);

// Welche Events in der Autovervollständigung je Unterbefehl erscheinen
const AUTOCOMPLETE_STATUS = {
  start: [EVENT.GEPLANT],
  ende: [EVENT.LAEUFT],
  teilnehmer: [EVENT.LAEUFT],
  abbrechen: [EVENT.GEPLANT, EVENT.LAEUFT],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Events ankündigen und Teilnahme im Call erfassen')
    .setDMPermission(false)
    .addSubcommand((s) => s
      .setName('ankuendigen')
      .setDescription('Neues Event ankündigen')
      .addStringOption((o) => o.setName('name').setDescription('Name des Events').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('start').setDescription('z.B. "20.11.2026 20:00", "20.11. 20:00" oder "20:00"').setRequired(true))
      .addNumberOption((o) => o.setName('summe').setDescription('Auszahlung pro Teilnehmer').setRequired(true).setMinValue(0.01))
      .addChannelOption((o) => o.setName('call').setDescription('Voice-Kanal, in dem die Teilnahme gezählt wird').setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
      .addIntegerOption((o) => o.setName('dauer').setDescription('Dauer in Minuten – danach automatisch beenden & auszahlen').setMinValue(1).setMaxValue(1440))
      .addIntegerOption((o) => o.setName('min_minuten').setDescription(`Mindestzeit im Call (Standard: ${config.payout.minPercent} % der Dauer)`).setMinValue(0).setMaxValue(1440))
      .addStringOption((o) => o.setName('beschreibung').setDescription('Infos zum Event').setMaxLength(1000))
      .addRoleOption((o) => o.setName('ping').setDescription('Rolle, die gepingt wird'))
      .addChannelOption((o) => o.setName('post_kanal').setDescription('Wo angekündigt wird (Standard: Ankündigungskanal)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s
      .setName('liste')
      .setDescription('Kommende und laufende Events')
      .addBooleanOption((o) => o.setName('alle').setDescription('Auch beendete/abgebrochene zeigen')))
    .addSubcommand((s) => s.setName('start').setDescription('Event jetzt starten (Call-Erfassung beginnt)').addIntegerOption(eventOption))
    .addSubcommand((s) => s.setName('ende').setDescription('Event beenden und Auszahlungen eintragen').addIntegerOption(eventOption))
    .addSubcommand((s) => s.setName('teilnehmer').setDescription('Aktuellen Stand im Call anzeigen').addIntegerOption(eventOption))
    .addSubcommand((s) => s.setName('abbrechen').setDescription('Event absagen (keine Auszahlungen)').addIntegerOption(eventOption)),

  async autocomplete(interaction) {
    const allowed = AUTOCOMPLETE_STATUS[interaction.options.getSubcommand()] ?? Object.values(EVENT);
    const typed = String(interaction.options.getFocused()).toLowerCase();
    const tables = await sheets.forGuild(interaction.guildId);
    const list = (await tables.events.readAll())
      .filter((e) => allowed.includes(e.Status))
      .map((e) => ({ name: `#${e.ID} ${e.Name} (${e.Start})`.slice(0, 100), value: Number(e.ID) }))
      .filter((c) => c.name.toLowerCase().includes(typed));
    await interaction.respond(list.slice(0, 25));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const tables = await sheets.forGuild(interaction.guildId);
    if (sub === 'liste') return liste(interaction, tables);
    if (await denyUnlessAdmin(interaction)) return;
    if (sub === 'ankuendigen') return ankuendigen(interaction, tables);

    await interaction.deferReply({ ephemeral: true });
    const ev = await events.getEvent(interaction.guildId, interaction.options.getInteger('event'));
    if (!ev) return interaction.editReply('Dieses Event gibt es nicht.');

    if (sub === 'start') {
      if (ev.Status !== EVENT.GEPLANT) return interaction.editReply(`Event #${ev.ID} hat den Status „${ev.Status}“.`);
      const count = await events.startEvent(interaction.client, ev);
      return interaction.editReply(`▶️ **${ev.Name}** gestartet – ${count} Person(en) sind schon im Call und werden erfasst.`);
    }

    if (sub === 'ende') {
      if (!tracker.get(events.trackKey(ev))) return interaction.editReply(`Event #${ev.ID} läuft gerade nicht.`);
      const { embed } = await events.endEvent(interaction.client, ev, interaction.user.username);
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === 'teilnehmer') {
      const snap = tracker.snapshot(events.trackKey(ev));
      if (!snap) return interaction.editReply(`Event #${ev.ID} läuft gerade nicht.`);
      const minMs = events.minAttendanceMs(ev, snap.durationMs);
      const lines = snap.users
        .sort((a, b) => b.ms - a.ms)
        .map((u) => `${u.ms >= minMs ? '✅' : '⏳'} ${u.present ? '🔊' : '🔇'} <@${u.id}> – ${minutes(u.ms)} Min`);
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 ${ev.Name} – Teilnehmer im Call`)
        .setDescription(lines.length ? clip(lines) : 'Noch niemand im Call.')
        .setFooter({ text: `Läuft seit ${minutes(snap.durationMs)} Min · Mindestzeit aktuell ${minutes(minMs)} Min · ✅ = bekommt Auszahlung, 🔊 = gerade im Call` });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === 'abbrechen') {
      if (![EVENT.GEPLANT, EVENT.LAEUFT].includes(ev.Status)) return interaction.editReply(`Event #${ev.ID} ist schon ${ev.Status.toLowerCase()}.`);
      await events.cancelEvent(ev);
      await events.postTo(interaction.client, ev['Post-Kanal-ID'], { content: `❌ **${ev.Name}** wurde abgesagt.` });
      return interaction.editReply(`❌ Event #${ev.ID} abgebrochen.`);
    }
  },
};

async function ankuendigen(interaction, tables) {
  const o = interaction.options;
  const startMs = parseDateTime(o.getString('start'));
  if (!startMs) {
    return interaction.reply({ content: '⛔ Startzeit nicht erkannt. Beispiele: `20.11.2026 20:00`, `20.11. 20:00`, `20:00`', ephemeral: true });
  }
  if (startMs < Date.now() - 5 * 60_000) {
    return interaction.reply({ content: `⛔ Die Startzeit (${formatDate(startMs)}) liegt in der Vergangenheit.`, ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const call = o.getChannel('call');
  let postChannel = o.getChannel('post_kanal');
  const { announceChannelId } = servers.get(interaction.guildId);
  if (!postChannel && announceChannelId) {
    postChannel = await interaction.client.channels.fetch(announceChannelId).catch(() => null);
  }
  postChannel ??= interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));

  const name = o.getString('name');
  const summe = o.getNumber('summe');
  const dauer = o.getInteger('dauer');
  const minMin = o.getInteger('min_minuten');
  const beschreibung = o.getString('beschreibung') ?? '';
  const ping = o.getRole('ping');

  const ev = await tables.events.add({
    Name: name,
    Start: formatDate(startMs),
    'Start (Unix)': Math.floor(startMs / 1000),
    'Dauer (Min)': dauer ?? '',
    'Min. Minuten': minMin ?? '',
    Summe: summe,
    'Voice-Kanal-ID': call.id,
    'Voice-Kanal': call.name,
    'Post-Kanal-ID': postChannel.id,
    Status: EVENT.GEPLANT,
    'Erstellt von': interaction.user.username,
    Beschreibung: beschreibung,
  });

  const mindest = minMin != null ? `${minMin} Min` : `${config.payout.minPercent} % der Eventdauer`;
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`📣 ${name}`)
    .setDescription(beschreibung || null)
    .addFields(
      { name: '🕒 Start', value: `${discordTs(startMs, 'F')}\n(${discordTs(startMs, 'R')})`, inline: true },
      { name: '⏱️ Dauer', value: dauer ? `${dauer} Min` : 'offen', inline: true },
      { name: '🔊 Call', value: `${call}`, inline: true },
      { name: '💰 Auszahlung', value: `${money(summe)} pro Teilnehmer`, inline: true },
      { name: '✅ Bedingung', value: `mind. ${mindest} im Call`, inline: true },
    )
    .setFooter({ text: `Event #${ev.ID} · Spieler-ID mit /id setzen hinterlegen, sonst kann nicht ausgezahlt werden` });

  const isEveryone = ping && ping.id === interaction.guildId;
  const msg = await postChannel.send({
    content: ping ? (isEveryone ? '@everyone' : `${ping}`) : undefined,
    embeds: [embed],
    allowedMentions: isEveryone ? { parse: ['everyone'] } : { roles: ping ? [ping.id] : [] },
  }).catch((err) => {
    console.error('Ankündigung fehlgeschlagen:', err.message);
    return null;
  });
  if (msg) await tables.events.update(byId(ev.ID), { 'Nachricht-ID': msg.id });

  await interaction.editReply(
    msg
      ? `✅ Event #${ev.ID} angekündigt in ${postChannel}. Die Call-Erfassung startet automatisch ${discordTs(startMs, 'R')}` +
        (dauer ? ` und endet nach ${dauer} Min mit automatischer Auszahlung.` : ' – beenden mit `/event ende`.')
      : `⚠️ Event #${ev.ID} gespeichert, aber ich konnte nicht in ${postChannel} posten (fehlen mir Rechte?).`,
  );
}

async function liste(interaction, tables) {
  await interaction.deferReply();
  const alle = interaction.options.getBoolean('alle') ?? false;
  const list = (await tables.events.readAll())
    .filter((e) => alle || e.Status === EVENT.GEPLANT || e.Status === EVENT.LAEUFT)
    .sort((a, b) => Number(a['Start (Unix)']) - Number(b['Start (Unix)']));
  const icon = { [EVENT.GEPLANT]: '🗓️', [EVENT.LAEUFT]: '🟢', [EVENT.BEENDET]: '🏁', [EVENT.ABGEBROCHEN]: '❌' };
  const lines = list.map((e) =>
    `${icon[e.Status] ?? ''} **#${e.ID} ${e.Name}** – ${discordTs(Number(e['Start (Unix)']) * 1000, 'f')} – ` +
    `<#${e['Voice-Kanal-ID']}> – ${money(e.Summe)}${e.Status === EVENT.BEENDET ? ` · ${e.Teilnehmer} Teilnehmer` : ''}`);
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(alle ? '📅 Alle Events' : '📅 Kommende Events')
    .setDescription(lines.length ? clip(lines) : 'Keine Events geplant.');
  return interaction.editReply({ embeds: [embed] });
}
