const { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } = require('discord.js');
const sheets = require('../sheets');
const servers = require('../servers');
const events = require('../events');
const { denyUnlessAdmin } = require('../permissions');
const { currentList, playerChoices, eventChoices, requirePlayer, requireEvent } = require('../lookup');
const { money, clip, parseDays, formatDays, parseTime, formatTime } = require('../format');
const store = require('../eventstore');
const payoutList = require('../payoutlist');

const spielerOption = (o) => o.setName('spieler').setDescription('Name oder ID tippen und auswählen').setRequired(true).setAutocomplete(true);

/** Übersicht eines Spielers: Teilnahmen je Event, verdient, ausgezahlt, Sanktionen, offen. */
function playerEmbed(liste, player) {
  const s = liste.stats(player);
  const lines = s.counts.map((e) => `${e.name}: **${e.count}×** = ${money(e.count * e.amount)}`);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`💰 ${player.label}`)
    .setDescription(lines.length ? clip(lines) : 'Noch keine Teilnahmen.')
    .addFields(
      { name: 'Verdient', value: money(s.earned), inline: true },
      { name: 'Ausgezahlt', value: money(s.ausgezahlt), inline: true },
      { name: 'Sanktionen', value: money(s.sanktion), inline: true },
      { name: 'Offen', value: `**${money(s.offen)}**`, inline: true },
    );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auszahlung')
    .setDescription('Auszahlungsliste')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('meine').setDescription('Deine Teilnahmen und dein offener Betrag'))
    .addSubcommand((s) => s.setName('offen').setDescription('Admins: alle offenen Beträge'))
    .addSubcommand((s) => s
      .setName('liste')
      .setDescription('Admins: Auszahlungsliste posten – mit Auswahlmenü zum Abhaken')
      .addChannelOption((o) => o.setName('kanal').setDescription('Wohin? (Standard: hier)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s
      .setName('automatisch')
      .setDescription('Admins: Auszahlungsliste regelmäßig automatisch posten')
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName('tage').setDescription('z.B. "So", "Mo,Do", "täglich"').setRequired(true))
      .addStringOption((o) => o.setName('zeit').setDescription('z.B. "18:00"').setRequired(true)))
    .addSubcommand((s) => s.setName('automatisch_aus').setDescription('Admins: automatische Auszahlungsliste abschalten'))
    .addSubcommand((s) => s.setName('spieler').setDescription('Admins: Übersicht eines Spielers').addStringOption(spielerOption))
    .addSubcommand((s) => s
      .setName('eintragen')
      .setDescription('Admins: Teilnahme(n) von Hand eintragen')
      .addStringOption(spielerOption)
      .addStringOption((o) => o.setName('art').setDescription('Event-Spalte').setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('anzahl').setDescription('Standard 1, negativ zum Korrigieren').setMinValue(-100).setMaxValue(100)))
    .addSubcommand((s) => s
      .setName('erledigt')
      .setDescription('Admins: Auszahlung erledigt → Betrag in „ausgezahlt“ eintragen')
      .addStringOption(spielerOption)
      .addNumberOption((o) => o.setName('betrag').setDescription('Standard: der komplette offene Betrag').setMinValue(1)))
    .addSubcommand((s) => s
      .setName('sanktion')
      .setDescription('Admins: Sanktion eintragen (wird vom offenen Betrag abgezogen)')
      .addStringOption(spielerOption)
      .addNumberOption((o) => o.setName('betrag').setDescription('Betrag').setRequired(true).setMinValue(1))),

  async autocomplete(interaction) {
    const liste = await currentList(interaction.guildId);
    const focused = interaction.options.getFocused(true);
    await interaction.respond(focused.name === 'art' ? eventChoices(liste, focused.value) : playerChoices(liste, focused.value));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'meine') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const liste = await currentList(guildId);
      const player = events.resolvePlayer(liste, guildId, { id: interaction.user.id, name: interaction.member?.displayName ?? interaction.user.username });
      if (!player) return interaction.editReply('Du bist noch mit keinem Eintrag in der Liste verknüpft → `/id setzen`.');
      return interaction.editReply({ embeds: [playerEmbed(liste, player)] });
    }

    if (await denyUnlessAdmin(interaction)) return;
    const { sheetId, tab } = servers.sheetOf(guildId);

    if (sub === 'liste') {
      const kanal = interaction.options.getChannel('kanal');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const msg = await payoutList.post(interaction.client, guildId, kanal?.id ?? interaction.channelId);
      return interaction.editReply(`✅ Auszahlungsliste gepostet: ${msg.url}`);
    }

    if (sub === 'automatisch') {
      const tage = parseDays(interaction.options.getString('tage'));
      const time = parseTime(interaction.options.getString('zeit'));
      if (!tage || !time) {
        return interaction.reply({ content: '⛔ Tage oder Uhrzeit nicht erkannt. Beispiel: `tage:So zeit:18:00`', flags: MessageFlags.Ephemeral });
      }
      const kanal = interaction.options.getChannel('kanal');
      store.setPayoutPlan(guildId, { channelId: kanal.id, tage, zeit: formatTime(time) });
      return interaction.reply({
        content: `✅ Die Auszahlungsliste wird ab jetzt **${formatDays(tage)} um ${formatTime(time)}** in ${kanal} gepostet.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'automatisch_aus') {
      store.setPayoutPlan(guildId, null);
      return interaction.reply({ content: '✅ Automatische Auszahlungsliste abgeschaltet.', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'offen') {
      await interaction.deferReply();
      const liste = await currentList(guildId);
      const rows = liste.players
        .map((p) => ({ p, offen: liste.stats(p).offen }))
        .filter((r) => r.offen > 0)
        .sort((a, b) => b.offen - a.offen);
      const total = rows.reduce((s, r) => s + r.offen, 0);
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`💸 Offene Auszahlungen (${rows.length} Spieler)`)
        .setURL(liste.url())
        .setDescription(rows.length ? clip(rows.map((r) => `${r.p.label} – **${money(r.offen)}**`)) : 'Alles ausgezahlt 🎉')
        .addFields({ name: 'Gesamt offen', value: money(total) })
        .setFooter({ text: 'Nach dem Auszahlen: /auszahlung erledigt' });
      return interaction.editReply({ embeds: [embed] });
    }

    await interaction.deferReply();
    let liste = await currentList(guildId);
    const player = requirePlayer(liste, interaction.options.getString('spieler'));

    if (sub === 'spieler') return interaction.editReply({ embeds: [playerEmbed(liste, player)] });

    if (sub === 'eintragen') {
      const ev = requireEvent(liste, interaction.options.getString('art'));
      const anzahl = interaction.options.getInteger('anzahl') ?? 1;
      const { credited } = await sheets.addEventCounts(sheetId, tab, ev.name, [{ row: player.row }], anzahl);
      liste = await currentList(guildId);
      return interaction.editReply({
        content: `✅ ${player.label}: „${ev.name}“ ${anzahl >= 0 ? '+' : ''}${anzahl} → jetzt **${credited[0].count}×**`,
        embeds: [playerEmbed(liste, liste.byId(player.id) ?? player)],
      });
    }

    if (sub === 'erledigt' || sub === 'sanktion') {
      const kind = sub === 'erledigt' ? 'ausgezahlt' : 'sanktion';
      let betrag = interaction.options.getNumber('betrag');
      if (sub === 'erledigt' && betrag == null) {
        betrag = liste.stats(player).offen;
        if (betrag <= 0) return interaction.editReply(`Bei ${player.label} ist nichts offen.`);
      }
      await sheets.addAmount(sheetId, tab, kind, player.id, betrag);
      liste = await currentList(guildId);
      return interaction.editReply({
        content: sub === 'erledigt'
          ? `✅ ${money(betrag)} an ${player.label} als **ausgezahlt** eingetragen.`
          : `⚠️ Sanktion über ${money(betrag)} für ${player.label} eingetragen.`,
        embeds: [playerEmbed(liste, liste.byId(player.id) ?? player)],
      });
    }
  },
};
