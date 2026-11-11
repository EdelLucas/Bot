const { Client, GatewayIntentBits, Events, Collection, MessageFlags } = require('discord.js');
const config = require('./config');
const sheets = require('./sheets');
const servers = require('./servers');
const tracker = require('./tracker');
const eventFlow = require('./events');
const payoutList = require('./payoutlist');
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
  console.log(`🌐 Auf ${c.guilds.cache.size} Server(n), davon ${servers.configuredGuildIds().length} mit Liste eingerichtet`);
  for (const guildId of servers.configuredGuildIds()) {
    const { sheetId, tab } = servers.get(guildId);
    sheets.load(sheetId, tab)
      .then((l) => console.log(`📊 ${c.guilds.cache.get(guildId)?.name ?? guildId}: Blatt „${tab}“ – ${l.players.length} Spieler, ${l.events.length} Event-Spalten`))
      .catch((err) => console.error(`⚠️ Liste für Server ${guildId} nicht lesbar:`, err.message));
  }
  await tracker.resync(c);
  eventFlow.startScheduler(c);
});

// Begrüßung, wenn der Bot auf einen neuen Server eingeladen wird
client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Neuer Server: ${guild.name} (${guild.id})`);
  const channel = guild.systemChannel;
  if (!channel?.permissionsFor(guild.members.me)?.has('SendMessages')) return;
  const email = sheets.serviceAccountEmail();
  await channel.send(
    '👋 Hi! Ich kündige Events an, prüfe den Call und zähle die Teilnahmen in eurer Auszahlungsliste (Google Sheet) hoch.\n' +
    '**Einrichten (für Admins):**\n' +
    '1. Euer Google Sheet ' + (email ? `mit \`${email}\`` : 'mit der Bot-E-Mail') + ' als **Bearbeiter** teilen\n' +
    '2. `/setup sheet link:<Link zum Blatt mit der Liste>`\n' +
    '3. Optional: `/setup kanal` (Ankündigungen) und `/setup adminrolle`',
  ).catch(() => {});
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  try {
    tracker.handleVoiceUpdate(oldState, newState);
  } catch (err) {
    console.error('Voice-Tracking-Fehler:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if ((interaction.isStringSelectMenu() || interaction.isButton()) && payoutList.isPayoutComponent(interaction)) {
    await payoutList.handleComponent(interaction).catch(async (err) => {
      console.error('Auszahlungsliste:', err);
      const msg = { content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral };
      await (interaction.deferred || interaction.replied ? interaction.followUp(msg) : interaction.reply(msg)).catch(() => {});
    });
    return;
  }
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
    const msg = { content: `❌ ${err.message || 'Da ist etwas schiefgelaufen.'}`, flags: MessageFlags.Ephemeral };
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply(msg);
      else await interaction.reply(msg);
    } catch { /* Interaction evtl. abgelaufen */ }
  }
});

(async () => {
  const email = sheets.serviceAccountEmail();
  if (email) console.log(`🔑 Google-Dienstkonto: ${email} (mit dieser Adresse die Sheets teilen)`);
  else console.warn('⚠️ Kein Google-Schlüssel gefunden – Sheets funktionieren erst mit credentials.json.');
  await client.login(config.discord.token);
})().catch((err) => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
