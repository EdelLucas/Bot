const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sheets = require('../sheets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('eintrag')
    .setDescription('Neuen Eintrag ins Sheet schreiben')
    .addStringOption((o) =>
      o.setName('inhalt').setDescription('Was soll eingetragen werden?').setRequired(true).setMaxLength(1000))
    .addStringOption((o) =>
      o.setName('kategorie').setDescription('Optionale Kategorie').setMaxLength(100)),

  async execute(interaction) {
    await interaction.deferReply();
    const entry = await sheets.add({
      Datum: new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }),
      Benutzer: interaction.user.username,
      'Benutzer-ID': interaction.user.id,
      Kategorie: interaction.options.getString('kategorie') || '',
      Inhalt: interaction.options.getString('inhalt'),
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`✅ Eintrag #${entry.ID} gespeichert`)
      .setDescription(entry.Inhalt)
      .setFooter({ text: `von ${entry.Benutzer} · ${entry.Datum}` });
    if (entry.Kategorie) embed.addFields({ name: 'Kategorie', value: entry.Kategorie, inline: true });

    await interaction.editReply({ embeds: [embed] });
  },
};
