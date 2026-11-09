const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { tables, byId, PAYOUT, url } = require('../sheets');
const { denyUnlessAdmin } = require('../permissions');
const { formatDate, money, clip } = require('../format');

const STATUS_CHOICES = [
  { name: 'Offen', value: PAYOUT.OFFEN },
  { name: 'Ausgezahlt', value: PAYOUT.AUSGEZAHLT },
  { name: 'ID fehlt', value: PAYOUT.ID_FEHLT },
  { name: 'Alle', value: 'alle' },
];

const sum = (rows) => rows.reduce((s, r) => s + (Number(r.Summe) || 0), 0);
const line = (r) =>
  `**#${r.ID}** ${r['Spieler-ID'] ? `\`${r['Spieler-ID']}\`` : '⚠️ ID fehlt'} ${r['Discord-Name'] || ''} – ` +
  `${r.Event} – **${money(r.Summe)}**${r.Status !== PAYOUT.OFFEN ? ` · ${r.Status}` : ''}`;
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('auszahlung')
    .setDescription('Auszahlungsliste verwalten')
    .setDMPermission(false)
    .addSubcommand((s) => s
      .setName('hinzufuegen')
      .setDescription('Auszahlung manuell eintragen')
      .addStringOption((o) => o.setName('spieler_id').setDescription('Spieler-ID').setRequired(true).setMaxLength(50))
      .addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).setMaxLength(100).setAutocomplete(true))
      .addNumberOption((o) => o.setName('summe').setDescription('Betrag').setRequired(true).setMinValue(0.01)))
    .addSubcommand((s) => s
      .setName('liste')
      .setDescription('Auszahlungen anzeigen')
      .addStringOption((o) => o.setName('status').setDescription('Standard: Offen').addChoices(...STATUS_CHOICES))
      .addStringOption((o) => o.setName('event').setDescription('Nur dieses Event').setAutocomplete(true))
      .addStringOption((o) => o.setName('spieler_id').setDescription('Nur diese Spieler-ID')))
    .addSubcommand((s) => s
      .setName('offen')
      .setDescription('Offene Beträge pro Spieler-ID zusammengerechnet'))
    .addSubcommand((s) => s
      .setName('erledigt')
      .setDescription('Auszahlungen als ausgezahlt markieren')
      .addIntegerOption((o) => o.setName('eintrag').setDescription('Eintrags-Nr. (#)').setMinValue(1))
      .addStringOption((o) => o.setName('spieler_id').setDescription('Alle offenen dieser Spieler-ID'))
      .addStringOption((o) => o.setName('event').setDescription('Alle offenen dieses Events').setAutocomplete(true)))
    .addSubcommand((s) => s
      .setName('loeschen')
      .setDescription('Auszahlung löschen')
      .addIntegerOption((o) => o.setName('eintrag').setDescription('Eintrags-Nr. (#)').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s
      .setName('meine')
      .setDescription('Deine offenen Auszahlungen')),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const events = (await tables.events.readAll())
      .sort((a, b) => Number(b['Start (Unix)']) - Number(a['Start (Unix)']));
    const names = [...new Set(events.map((e) => String(e.Name)))].filter((n) => n.toLowerCase().includes(typed));
    await interaction.respond(names.slice(0, 25).map((n) => ({ name: n.slice(0, 100), value: n.slice(0, 100) })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'meine') return meine(interaction);
    if (await denyUnlessAdmin(interaction)) return;

    if (sub === 'hinzufuegen') {
      await interaction.deferReply();
      const spielerId = interaction.options.getString('spieler_id').trim();
      const eventName = interaction.options.getString('event').trim();
      const summe = interaction.options.getNumber('summe');
      const [ev] = await tables.events.find((e) => sameText(e.Name, eventName));
      const [player] = await tables.spieler.find((p) => String(p['Spieler-ID']) === spielerId);

      const entry = await tables.auszahlungen.add({
        Datum: formatDate(),
        'Event-ID': ev?.ID ?? '',
        Event: ev?.Name ?? eventName,
        'Spieler-ID': spielerId,
        'Discord-Name': player?.['Discord-Name'] ?? '',
        'Discord-ID': player?.['Discord-ID'] ?? '',
        Summe: summe,
        Status: PAYOUT.OFFEN,
        Quelle: 'Manuell',
        'Eingetragen von': interaction.user.username,
      });
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`💰 Auszahlung #${entry.ID} eingetragen`)
        .addFields(
          { name: 'Spieler-ID', value: `\`${spielerId}\``, inline: true },
          { name: 'Event', value: entry.Event, inline: true },
          { name: 'Summe', value: money(summe), inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'liste') {
      await interaction.deferReply();
      const status = interaction.options.getString('status') ?? PAYOUT.OFFEN;
      const event = interaction.options.getString('event');
      const spielerId = interaction.options.getString('spieler_id');
      const rows = (await tables.auszahlungen.readAll()).filter((r) =>
        (status === 'alle' || r.Status === status) &&
        (!event || sameText(r.Event, event)) &&
        (!spielerId || String(r['Spieler-ID']) === spielerId.trim()));
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📋 Auszahlungen – ${status === 'alle' ? 'alle' : status} (${rows.length})`)
        .setURL(url())
        .setDescription(rows.length ? clip([...rows].reverse().map(line)) : 'Keine Einträge.')
        .addFields({ name: 'Summe', value: money(sum(rows)) });
      return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (sub === 'offen') {
      await interaction.deferReply();
      const rows = (await tables.auszahlungen.readAll())
        .filter((r) => r.Status === PAYOUT.OFFEN || r.Status === PAYOUT.ID_FEHLT);
      const groups = new Map();
      for (const r of rows) {
        const key = r['Spieler-ID'] ? `id:${r['Spieler-ID']}` : `dc:${r['Discord-ID']}`;
        const g = groups.get(key) ?? { label: '', total: 0, count: 0 };
        g.label = r['Spieler-ID'] ? `\`${r['Spieler-ID']}\` ${r['Discord-Name'] || ''}` : `⚠️ ID fehlt – ${r['Discord-Name']}`;
        g.total += Number(r.Summe) || 0;
        g.count += 1;
        groups.set(key, g);
      }
      const lines = [...groups.values()]
        .sort((a, b) => b.total - a.total)
        .map((g) => `${g.label} – **${money(g.total)}** (${g.count}×)`);
      const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle(`💸 Offene Auszahlungen (${groups.size} Spieler)`)
        .setURL(url())
        .setDescription(lines.length ? clip(lines) : 'Alles ausgezahlt 🎉')
        .addFields({ name: 'Gesamt offen', value: money(sum(rows)) })
        .setFooter({ text: 'Nach dem Auszahlen: /auszahlung erledigt spieler_id:<ID>' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'erledigt') {
      const eintrag = interaction.options.getInteger('eintrag');
      const spielerId = interaction.options.getString('spieler_id')?.trim();
      const event = interaction.options.getString('event');
      if (!eintrag && !spielerId && !event) {
        return interaction.reply({ content: 'Gib `eintrag`, `spieler_id` und/oder `event` an.', ephemeral: true });
      }
      await interaction.deferReply();
      const updated = await tables.auszahlungen.update(
        (r) => r.Status === PAYOUT.OFFEN &&
          (!eintrag || String(r.ID) === String(eintrag)) &&
          (!spielerId || String(r['Spieler-ID']) === spielerId) &&
          (!event || sameText(r.Event, event)),
        { Status: PAYOUT.AUSGEZAHLT, 'Ausgezahlt am': `${formatDate()} (${interaction.user.username})` });
      if (!updated.length) return interaction.editReply('Keine passenden offenen Auszahlungen gefunden.');
      return interaction.editReply(`✅ ${updated.length} Auszahlung(en) über insgesamt **${money(sum(updated))}** als ausgezahlt markiert.`);
    }

    if (sub === 'loeschen') {
      await interaction.deferReply({ ephemeral: true });
      const id = interaction.options.getInteger('eintrag');
      const [removed] = await tables.auszahlungen.remove(byId(id));
      return interaction.editReply(removed ? `🗑️ Auszahlung #${id} gelöscht (${line(removed)}).` : `Auszahlung #${id} gibt es nicht.`);
    }
  },
};

async function meine(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const [player] = await tables.spieler.find((p) => String(p['Discord-ID']) === interaction.user.id);
  const rows = (await tables.auszahlungen.readAll()).filter((r) =>
    (r.Status === PAYOUT.OFFEN || r.Status === PAYOUT.ID_FEHLT) &&
    (String(r['Discord-ID']) === interaction.user.id || (player && String(r['Spieler-ID']) === String(player['Spieler-ID']))));
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('💰 Deine offenen Auszahlungen')
    .setDescription(rows.length ? clip(rows.map(line)) : 'Nichts offen.')
    .addFields(
      { name: 'Summe', value: money(sum(rows)), inline: true },
      { name: 'Spieler-ID', value: player ? `\`${player['Spieler-ID']}\`` : '⚠️ keine – `/id setzen`', inline: true },
    );
  return interaction.editReply({ embeds: [embed] });
}
