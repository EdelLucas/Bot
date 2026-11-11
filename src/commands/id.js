const { SlashCommandBuilder } = require('discord.js');
const sheets = require('../sheets');
const { PAYOUT } = sheets;
const { isAdmin } = require('../permissions');
const { formatDate } = require('../format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id')
    .setDescription('Spieler-ID für Auszahlungen hinterlegen')
    .setDMPermission(false)
    .addSubcommand((s) => s
      .setName('setzen')
      .setDescription('Deine Spieler-ID hinterlegen (Admins: auch für andere)')
      .addStringOption((o) => o.setName('spieler_id').setDescription('Deine Spieler-ID').setRequired(true).setMaxLength(50))
      .addUserOption((o) => o.setName('benutzer').setDescription('Nur Admins: für wen?')))
    .addSubcommand((s) => s
      .setName('anzeigen')
      .setDescription('Hinterlegte Spieler-ID anzeigen')
      .addUserOption((o) => o.setName('benutzer').setDescription('Wessen ID? (Standard: deine)'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const tables = await sheets.forGuild(interaction.guildId);
    const target = interaction.options.getUser('benutzer') ?? interaction.user;

    if (sub === 'anzeigen') {
      const [p] = await tables.spieler.find((e) => String(e['Discord-ID']) === target.id);
      return interaction.reply({
        content: p ? `🆔 ${target} hat die Spieler-ID \`${p['Spieler-ID']}\`.` : `${target} hat noch keine Spieler-ID hinterlegt.`,
        ephemeral: true,
        allowedMentions: { parse: [] },
      });
    }

    const admin = isAdmin(interaction);
    if (target.id !== interaction.user.id && !admin) {
      return interaction.reply({ content: '⛔ Nur Admins können die ID für andere setzen.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const spielerId = interaction.options.getString('spieler_id').trim();
    const member = interaction.options.getMember('benutzer') ?? interaction.member;
    const name = member?.displayName ?? target.username;

    const taken = await tables.spieler.find(
      (e) => String(e['Spieler-ID']) === spielerId && String(e['Discord-ID']) !== target.id);
    if (taken.length && !admin) {
      return interaction.editReply(`⛔ Die Spieler-ID \`${spielerId}\` ist schon einem anderen Discord-Konto zugeordnet. Melde dich bei einem Admin.`);
    }

    const data = { 'Discord-ID': target.id, 'Discord-Name': name, 'Spieler-ID': spielerId, Aktualisiert: formatDate() };
    const updated = await tables.spieler.update((e) => String(e['Discord-ID']) === target.id, data);
    if (!updated.length) await tables.spieler.add(data);

    // offene Auszahlungen dieser Person (auch die mit fehlender ID) auf die neue ID setzen
    const fixed = await tables.auszahlungen.update(
      (e) => String(e['Discord-ID']) === target.id && [PAYOUT.OFFEN, PAYOUT.ID_FEHLT].includes(e.Status),
      { 'Spieler-ID': spielerId, Status: PAYOUT.OFFEN });

    await interaction.editReply(
      `✅ Spieler-ID \`${spielerId}\` für ${target} gespeichert.` +
      (fixed.length ? `\n${fixed.length} offene Auszahlung(en) wurden aktualisiert.` : '') +
      (taken.length ? `\n⚠️ Hinweis: Die ID ist auch bei ${taken.map((t) => `<@${t['Discord-ID']}>`).join(', ')} hinterlegt.` : ''),
    );
  },
};
