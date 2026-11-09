const { SlashCommandBuilder } = require('discord.js');
const sheets = require('../sheets');

module.exports = {
  data: new SlashCommandBuilder().setName('sheet').setDescription('Link zum Google Sheet'),
  async execute(interaction) {
    await interaction.reply({ content: `📊 ${sheets.url()}`, ephemeral: true });
  },
};
