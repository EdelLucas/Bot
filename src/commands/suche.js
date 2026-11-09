const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sheets = require('../sheets');
const { formatEntry } = require('./_format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suche')
    .setDescription('Durchsucht die Einträge im Sheet')
    .addStringOption((o) => o.setName('begriff').setDescription('Suchbegriff').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const begriff = interaction.options.getString('begriff').toLowerCase();
    const hits = (await sheets.getAll()).filter((e) =>
      [e.Inhalt, e.Kategorie, e.Benutzer].some((v) => v.toLowerCase().includes(begriff)));
    const shown = hits.slice(-25).reverse();

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`🔎 ${hits.length} Treffer für „${begriff}“`)
      .setDescription(shown.length ? shown.map(formatEntry).join('\n').slice(0, 4000) : 'Nichts gefunden.');

    await interaction.editReply({ embeds: [embed] });
  },
};
