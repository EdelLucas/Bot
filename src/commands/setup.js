const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const sheets = require('../sheets');
const servers = require('../servers');

function shareHint(email) {
  return email
    ? `Öffne dein Google Sheet → **Teilen** → diese Adresse als **Bearbeiter** hinzufügen:\n\`${email}\``
    : '⚠️ Auf dem Bot-Server fehlt der Google-Schlüssel (credentials.json). Bitte den Betreiber des Bots fragen.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Bot für diesen Server einrichten (Sheet, Ankündigungskanal, Admin-Rolle)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s
      .setName('sheet')
      .setDescription('Google Sheet verbinden, in das dieser Server schreibt')
      .addStringOption((o) => o.setName('link').setDescription('Link zum Google Sheet').setRequired(true)))
    .addSubcommand((s) => s
      .setName('kanal')
      .setDescription('Standard-Kanal für Event-Ankündigungen')
      .addChannelOption((o) => o.setName('kanal').setDescription('Textkanal').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s
      .setName('adminrolle')
      .setDescription('Rolle, die Events und Auszahlungen verwalten darf')
      .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true)))
    .addSubcommand((s) => s.setName('info').setDescription('Aktuelle Einstellungen anzeigen')),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '⛔ Nur Leute mit „Server verwalten“ können den Bot einrichten.', ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const email = sheets.serviceAccountEmail();

    if (sub === 'sheet') {
      const sheetId = sheets.parseSheetId(interaction.options.getString('link'));
      if (!sheetId) {
        return interaction.reply({
          content: '⛔ Das sieht nicht nach einem Google-Sheet-Link aus. Beispiel: `https://docs.google.com/spreadsheets/d/1AbC.../edit`',
          ephemeral: true,
        });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        await sheets.forSheet(sheetId); // prüft Zugriff und legt die Tabellenblätter an
      } catch (err) {
        return interaction.editReply(
          `❌ Ich komme nicht an das Sheet ran (${err.message}).\n\n${shareHint(email)}\n\nDanach \`/setup sheet\` nochmal ausführen.`);
      }
      servers.set(guildId, { sheetId });
      return interaction.editReply(
        `✅ Sheet verbunden: ${sheets.url(sheetId)}\nDie Blätter **Auszahlungen**, **Events** und **Spieler** sind angelegt.` +
        (servers.get(guildId).announceChannelId ? '' : '\n\nTipp: Mit `/setup kanal` den Ankündigungskanal festlegen.'));
    }

    if (sub === 'kanal') {
      const kanal = interaction.options.getChannel('kanal');
      servers.set(guildId, { announceChannelId: kanal.id });
      return interaction.reply({ content: `✅ Events werden ab jetzt in ${kanal} angekündigt.`, ephemeral: true });
    }

    if (sub === 'adminrolle') {
      const rolle = interaction.options.getRole('rolle');
      servers.set(guildId, { adminRoleId: rolle.id });
      return interaction.reply({
        content: `✅ ${rolle} darf jetzt Events und Auszahlungen verwalten.`, ephemeral: true, allowedMentions: { parse: [] },
      });
    }

    const s = servers.get(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚙️ Einstellungen')
      .addFields(
        { name: 'Google Sheet', value: s.sheetId ? sheets.url(s.sheetId) : '❌ nicht eingerichtet → `/setup sheet`' },
        { name: 'Ankündigungskanal', value: s.announceChannelId ? `<#${s.announceChannelId}>` : 'nicht gesetzt (Kanal, in dem der Befehl benutzt wird)', inline: true },
        { name: 'Admin-Rolle', value: s.adminRoleId ? `<@&${s.adminRoleId}>` : 'nur „Server verwalten“', inline: true },
        { name: 'Bot-E-Mail zum Teilen', value: email ? `\`${email}\`` : '⚠️ Google-Schlüssel fehlt' },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  },
};
