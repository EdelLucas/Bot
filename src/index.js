const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const config = require('./config');
const sheets = require('./sheets');
const commandList = require('./commands');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = new Collection(commandList.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Eingeloggt als ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Fehler in /${interaction.commandName}:`, err);
    const msg = { content: '❌ Da ist etwas schiefgelaufen. Bitte später erneut versuchen.', ephemeral: true };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
      else await interaction.reply(msg);
    } catch { /* Interaction evtl. abgelaufen */ }
  }
});

(async () => {
  await sheets.init();
  console.log(`📊 Google Sheet verbunden: ${sheets.url()}`);
  await client.login(config.discord.token);
})().catch((err) => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
