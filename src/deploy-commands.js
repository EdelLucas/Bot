// Registriert die Slash-Commands bei Discord. Einmal ausführen (und nach jeder Änderung an Commands).
const { REST, Routes } = require('discord.js');
const config = require('./config');
const commands = require('./commands');

(async () => {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.discord.token);
  const route = config.discord.guildId
    ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
    : Routes.applicationCommands(config.discord.clientId);

  await rest.put(route, { body });
  console.log(`✅ ${body.length} Commands ${config.discord.guildId ? 'auf dem Server' : 'global'} registriert.`);
})().catch((err) => {
  console.error('Fehler beim Registrieren:', err);
  process.exit(1);
});
