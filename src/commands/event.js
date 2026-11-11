const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const servers = require('../servers');
const store = require('../eventstore');
const events = require('../events');
const tracker = require('../tracker');
const config = require('../config');
const { denyUnlessAdmin } = require('../permissions');
const { currentList, eventChoices, requireEvent } = require('../lookup');
const { parseDateTime, formatDate, discordTs, money, minutes, clip } = require('../format');

const { EVENT } = events;
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
      .addStringOption((o) => o.setName('art').setDescription('Event-Spalte aus der Liste (bestimmt den Betrag)').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('start').setDescription('z.B. "20.11.2026 20:00", "20.11. 20:00" oder "20:00"').setRequired(true))
      .addChannelOption((o) => o.setName('call').setDescription('Voice-Kanal, in dem die Teilnahme gezählt wird').setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
      .addStringOption((o) => o.setName('titel').setDescription('Eigener Titel (Standard: Name der Spalte)').setMaxLength(100))
      .addIntegerOption((o) => o.setName('dauer').setDescription('Dauer in Minuten – danach automatisch beenden & eintragen').setMinValue(1).setMaxValue(1440))
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
    .addSubcommand((s) => s.setName('ende').setDescription('Event beenden und Teilnahmen eintragen').addIntegerOption(eventOption))
    .addSubcommand((s) => s.setName('teilnehmer').setDescription('Aktuellen Stand im Call anzeigen').addIntegerOption(eventOption))
    .addSubcommand((s) => s.setName('abbrechen').setDescription('Event absagen (nichts wird eingetragen)').addIntegerOption(eventOption)),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'art') {
      const liste = await currentList(interaction.guildId);
      return interaction.respond(eventChoices(liste, focused.value));
    }
    const allowed = AUTOCOMPLETE_STATUS[sub] ?? Object.values(EVENT);
    const typed = String(focused.value).toLowerCase();
    const list = store.list(interaction.guildId)
      .filter((e) => allowed.includes(e.status))
      .map((e) => ({ name: `#${e.ID} ${events.eventTitle(e)} (${formatDate(e.start)})`.slice(0, 100), value: e.ID }))
      .filter((c) => c.name.toLowerCase().includes(typed))
      .slice(-25);
    await interaction.respond(list);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'liste') return liste(interaction);
    if (await denyUnlessAdmin(interaction)) return;
    if (sub === 'ankuendigen') return ankuendigen(interaction);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ev = store.get(interaction.guildId, interaction.options.getInteger('event'));
    if (!ev) return interaction.editReply('Dieses Event gibt es nicht.');

    if (sub === 'start') {
      if (ev.status !== EVENT.GEPLANT) return interaction.editReply(`Event #${ev.ID} hat den Status „${ev.status}“.`);
      const count = await events.startEvent(interaction.client, ev);
      return interaction.editReply(`▶️ **${events.eventTitle(ev)}** gestartet – ${count} Person(en) sind schon im Call und werden erfasst.`);
    }

    if (sub === 'ende') {
      if (!tracker.get(events.trackKey(ev))) return interaction.editReply(`Event #${ev.ID} läuft gerade nicht.`);
      const { embed } = await events.endEvent(interaction.client, ev);
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === 'teilnehmer') {
      const snap = tracker.snapshot(events.trackKey(ev));
      if (!snap) return interaction.editReply(`Event #${ev.ID} läuft gerade nicht.`);
      const minMs = events.minAttendanceMs(ev, snap.durationMs);
      const liste = await currentList(interaction.guildId);
      const lines = snap.users
        .sort((a, b) => b.ms - a.ms)
        .map((u) => {
          const p = events.resolvePlayer(liste, interaction.guildId, u);
          return `${u.ms >= minMs ? '✅' : '⏳'} ${u.present ? '🔊' : '🔇'} <@${u.id}> ${p ? `→ ${p.label}` : '→ ⚠️ nicht in der Liste'} – ${minutes(u.ms)} Min`;
        });
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 ${events.eventTitle(ev)} – Teilnehmer im Call`)
        .setDescription(lines.length ? clip(lines) : 'Noch niemand im Call.')
        .setFooter({ text: `Läuft seit ${minutes(snap.durationMs)} Min · Mindestzeit aktuell ${minutes(minMs)} Min · ✅ = wird eingetragen, 🔊 = gerade im Call` });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === 'abbrechen') {
      if (![EVENT.GEPLANT, EVENT.LAEUFT].includes(ev.status)) return interaction.editReply(`Event #${ev.ID} ist schon ${ev.status.toLowerCase()}.`);
      await events.cancelEvent(ev);
      await events.postTo(interaction.client, ev.postId, { content: `❌ **${events.eventTitle(ev)}** wurde abgesagt.` });
      return interaction.editReply(`❌ Event #${ev.ID} abgebrochen.`);
    }
  },
};

async function ankuendigen(interaction) {
  const o = interaction.options;
  const startMs = parseDateTime(o.getString('start'));
  if (!startMs) {
    return interaction.reply({ content: '⛔ Startzeit nicht erkannt. Beispiele: `20.11.2026 20:00`, `20.11. 20:00`, `20:00`', flags: MessageFlags.Ephemeral });
  }
  if (startMs < Date.now() - 5 * 60_000) {
    return interaction.reply({ content: `⛔ Die Startzeit (${formatDate(startMs)}) liegt in der Vergangenheit.`, flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const liste = await currentList(interaction.guildId);
  const art = requireEvent(liste, o.getString('art'));
  const call = o.getChannel('call');
  let postChannel = o.getChannel('post_kanal');
  const { announceChannelId } = servers.get(interaction.guildId);
  if (!postChannel && announceChannelId) {
    postChannel = await interaction.client.channels.fetch(announceChannelId).catch(() => null);
  }
  postChannel ??= interaction.channel ?? (await interaction.client.channels.fetch(interaction.channelId));

  const dauer = o.getInteger('dauer');
  const minMin = o.getInteger('min_minuten');
  const beschreibung = o.getString('beschreibung') ?? '';
  const ping = o.getRole('ping');

  const ev = store.create(interaction.guildId, {
    art: art.name,
    betrag: art.amount,
    titel: o.getString('titel') || '',
    start: startMs,
    dauer: dauer ?? null,
    minMinuten: minMin ?? null,
    voiceId: call.id,
    postId: postChannel.id,
    status: EVENT.GEPLANT,
    createdBy: interaction.user.username,
    beschreibung,
  });

  const mindest = minMin != null ? `${minMin} Min` : `${config.payout.minPercent} % der Eventdauer`;
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(`📣 ${events.eventTitle(ev)}`)
    .setDescription(beschreibung || null)
    .addFields(
      { name: '🕒 Start', value: `${discordTs(startMs, 'F')}\n(${discordTs(startMs, 'R')})`, inline: true },
      { name: '⏱️ Dauer', value: dauer ? `${dauer} Min` : 'offen', inline: true },
      { name: '🔊 Call', value: `${call}`, inline: true },
      { name: '💰 Auszahlung', value: `${money(art.amount)} pro Teilnehmer`, inline: true },
      { name: '✅ Bedingung', value: `mind. ${mindest} im Call`, inline: true },
    )
    .setFooter({ text: `Event #${ev.ID} · zählt als „${art.name}“ · nicht in der Liste? → /id setzen` });

  const isEveryone = ping && ping.id === interaction.guildId;
  const msg = await postChannel.send({
    content: ping ? (isEveryone ? '@everyone' : `${ping}`) : undefined,
    embeds: [embed],
    allowedMentions: isEveryone ? { parse: ['everyone'] } : { roles: ping ? [ping.id] : [] },
  }).catch((err) => {
    console.error('Ankündigung fehlgeschlagen:', err.message);
    return null;
  });
  if (msg) store.update(interaction.guildId, ev.ID, { messageId: msg.id });

  await interaction.editReply(
    msg
      ? `✅ Event #${ev.ID} angekündigt in ${postChannel}. Die Call-Erfassung startet automatisch ${discordTs(startMs, 'R')}` +
        (dauer ? ` und endet nach ${dauer} Min – dann wird „${art.name}“ bei allen Teilnehmern +1 gezählt.` : ' – beenden mit `/event ende`.')
      : `⚠️ Event #${ev.ID} gespeichert, aber ich konnte nicht in ${postChannel} posten (fehlen mir Rechte?).`,
  );
}

async function liste(interaction) {
  await interaction.deferReply();
  const alle = interaction.options.getBoolean('alle') ?? false;
  const list = store.list(interaction.guildId)
    .filter((e) => alle || e.status === EVENT.GEPLANT || e.status === EVENT.LAEUFT)
    .sort((a, b) => a.start - b.start);
  const icon = { [EVENT.GEPLANT]: '🗓️', [EVENT.LAEUFT]: '🟢', [EVENT.BEENDET]: '🏁', [EVENT.ABGEBROCHEN]: '❌' };
  const lines = list.map((e) =>
    `${icon[e.status] ?? ''} **#${e.ID} ${events.eventTitle(e)}** – ${discordTs(e.start, 'f')} – <#${e.voiceId}> – ${money(e.betrag)}` +
    `${e.status === EVENT.BEENDET ? ` · ${e.teilnehmer ?? 0} Teilnehmer` : ''}`);
  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle(alle ? '📅 Alle Events' : '📅 Kommende Events')
    .setDescription(lines.length ? clip(lines.slice(-40)) : 'Keine Events geplant.');
  return interaction.editReply({ embeds: [embed] });
}
