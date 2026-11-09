const { SlashCommandBuilder } = require('discord.js');
const sheets = require('../sheets');
const { canModify } = require('./_permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bearbeiten')
    .setDescription('Ändert einen Eintrag im Sheet')
    .addIntegerOption((o) => o.setName('id').setDescription('ID des Eintrags').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('inhalt').setDescription('Neuer Inhalt').setMaxLength(1000))
    .addStringOption((o) => o.setName('kategorie').setDescription('Neue Kategorie').setMaxLength(100)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const id = interaction.options.getInteger('id');
    const changes = {};
    const inhalt = interaction.options.getString('inhalt');
    const kategorie = interaction.options.getString('kategorie');
    if (inhalt !== null) changes.Inhalt = inhalt;
    if (kategorie !== null) changes.Kategorie = kategorie;
    if (!Object.keys(changes).length) {
      return interaction.editReply('Bitte gib mindestens `inhalt` oder `kategorie` an.');
    }

    const entry = await sheets.findById(id);
    if (!entry) return interaction.editReply(`Eintrag #${id} gibt es nicht.`);
    if (!canModify(interaction, entry)) {
      return interaction.editReply('Du darfst nur deine eigenen Einträge bearbeiten.');
    }

    const updated = await sheets.updateById(id, changes);
    if (!updated) return interaction.editReply(`Eintrag #${id} gibt es nicht mehr.`);
    await interaction.editReply(`✏️ Eintrag #${id} aktualisiert.`);
  },
};
