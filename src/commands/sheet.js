const { SlashCommandBuilder } = require('discord.js');
const sheets = require('../sheets');
const servers = require('../servers');

module.exports = {
  data: new SlashCommandBuilder().setName('sheet').setDescription('Link zum Google Sheet dieses Servers').setDMPermission(false),
  async execute(interaction) {
    const { sheetId } = servers.get(interaction.guildId);
    await interaction.reply({
      content: sheetId ? `📊 ${sheets.url(sheetId)}` : 'Für diesen Server ist noch kein Sheet eingerichtet (`/setup sheet`).',
      ephemeral: true,
    });
  },
};
