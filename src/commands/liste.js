const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sheets = require('../sheets');
const { formatEntry } = require('./_format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('liste')
    .setDescription('Zeigt die letzten Einträge aus dem Sheet')
    .addIntegerOption((o) =>
      o.setName('anzahl').setDescription('Wie viele (Standard 10)').setMinValue(1).setMaxValue(25))
    .addStringOption((o) => o.setName('kategorie').setDescription('Nur diese Kategorie'))
    .addUserOption((o) => o.setName('von').setDescription('Nur Einträge dieses Benutzers')),

  async execute(interaction) {
    await interaction.deferReply();
    const anzahl = interaction.options.getInteger('anzahl') ?? 10;
    const kategorie = interaction.options.getString('kategorie');
    const von = interaction.options.getUser('von');

    let entries = await sheets.getAll();
    if (kategorie) entries = entries.filter((e) => e.Kategorie.toLowerCase() === kategorie.toLowerCase());
    if (von) entries = entries.filter((e) => e['Benutzer-ID'] === von.id);
    const shown = entries.slice(-anzahl).reverse();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 Einträge (${shown.length} von ${entries.length})`)
      .setURL(sheets.url())
      .setDescription(shown.length ? shown.map(formatEntry).join('\n').slice(0, 4000) : 'Keine Einträge gefunden.');

    await interaction.editReply({ embeds: [embed] });
  },
};
