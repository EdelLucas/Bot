const { SlashCommandBuilder } = require('discord.js');
const sheets = require('../sheets');
const { canModify } = require('./_permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loeschen')
    .setDescription('Löscht einen Eintrag aus dem Sheet')
    .addIntegerOption((o) => o.setName('id').setDescription('ID des Eintrags').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');
    const entry = await sheets.findById(id);
    if (!entry) return interaction.editReply(`Eintrag #${id} gibt es nicht.`);
    if (!canModify(interaction, entry)) {
      return interaction.editReply('Du darfst nur deine eigenen Einträge löschen.');
    }

    const removed = await sheets.removeById(id);
    if (!removed) return interaction.editReply(`Eintrag #${id} gibt es nicht mehr.`);
    await interaction.editReply(`🗑️ Eintrag #${id} gelöscht.`);
  },
};
