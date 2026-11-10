const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const config = require('./config');
const sheets = require('./sheets');
const tracker = require('./tracker');
const eventFlow = require('./events');
const commandList = require('./commands');
const { registerCommands } = require('./register-commands');

const client = new Client({
  // GuildVoiceStates: nötig, um zu sehen, wer in welchem Call ist
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
const commands = new Collection(commandList.map((c) => [c.data.name, c]));

client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Eingeloggt als ${c.user.tag}`);
  if (config.autoRegisterCommands) {
    await registerCommands()
      .then(({ count, scope }) => console.log(`✅ ${count} Slash-Commands ${scope} registriert`))
      .catch((err) => console.error('Slash-Commands konnten nicht registriert werden:', err.message));
  }
  await tracker.resync(c);
  eventFlow.startScheduler(c);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  try {
    tracker.handleVoiceUpdate(oldState, newState);
  } catch (err) {
    console.error('Voice-Tracking-Fehler:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  if (interaction.isAutocomplete()) {
    await command.autocomplete?.(interaction).catch((err) => console.error('Autocomplete-Fehler:', err.message));
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Fehler in /${interaction.commandName}:`, err);
    const msg = { content: `❌ ${err.message || 'Da ist etwas schiefgelaufen.'}`, ephemeral: true };
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
