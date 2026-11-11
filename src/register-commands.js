const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');

/**
 * Registriert alle Slash-Commands global, also für jeden Server, auf dem der Bot ist.
 * Alte, nur für DISCORD_GUILD_ID registrierte Commands werden entfernt (sonst erscheinen sie doppelt).
 */
async function registerCommands() {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.discord.token);
  await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
  if (config.discord.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body: [] })
      .catch(() => {});
  }
  return { count: body.length, scope: 'für alle Server' };
}

module.exports = { registerCommands };
