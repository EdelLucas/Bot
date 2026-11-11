const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const servers = require('../servers');

module.exports = {
  data: new SlashCommandBuilder().setName('sheet').setDescription('Link zur Auszahlungsliste dieses Servers').setDMPermission(false),
  async execute(interaction) {
    const { sheetId, tab } = servers.get(interaction.guildId);
    await interaction.reply({
      content: sheetId
        ? `📊 https://docs.google.com/spreadsheets/d/${sheetId}/edit (Blatt „${tab}“)`
        : 'Für diesen Server ist noch keine Liste eingerichtet (`/setup sheet`).',
      flags: MessageFlags.Ephemeral,
    });
  },
};
