const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');

/** Registriert alle Slash-Commands bei Discord (überschreibt die vorherigen). */
async function registerCommands() {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.discord.token);
  const route = config.discord.guildId
    ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
    : Routes.applicationCommands(config.discord.clientId);
  await rest.put(route, { body });
  return { count: body.length, scope: config.discord.guildId ? 'auf dem Server' : 'global' };
}

module.exports = { registerCommands };
