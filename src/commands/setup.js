const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const sheets = require('../sheets');
const servers = require('../servers');
const { money } = require('../format');

function shareHint(email) {
  return email
    ? `Öffne dein Google Sheet → **Teilen** → diese Adresse als **Bearbeiter** hinzufügen:\n\`${email}\``
    : '⚠️ Auf dem Bot-Server fehlt der Google-Schlüssel. Bitte den Betreiber des Bots fragen.';
}

/** Zusammenfassung, was der Bot in der Liste erkannt hat. */
function summary(liste) {
  const missing = [];
  if (liste.cols.ausgezahlt == null) missing.push('„ausgezahlt“ (für `/auszahlung erledigt`)');
  if (liste.cols.sanktion == null) missing.push('„Sanktionen“ (für `/auszahlung sanktion`)');
  if (liste.cols.offen == null) missing.push('„Auszahlung offen“ (wird sonst selbst berechnet)');
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📋 Liste „${liste.tab}“${liste.title ? ` – ${liste.title}` : ''}`)
    .setURL(liste.url())
    .addFields(
      { name: `Spieler (${liste.players.length})`, value: liste.players.slice(0, 5).map((p) => p.label).join('\n') + (liste.players.length > 5 ? '\n…' : '') || '—' },
      { name: `Event-Spalten (${liste.events.length})`, value: liste.events.map((e) => `${e.name} → ${money(e.amount)}`).join('\n').slice(0, 1024) },
      ...(missing.length ? [{ name: '⚠️ Nicht gefunden', value: missing.join('\n') }] : []),
    )
    .setFooter({ text: 'Der Bot legt keine Blätter an – er zählt nur in dieser Liste hoch.' });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Bot für diesen Server einrichten (Liste, Ankündigungskanal, Admin-Rolle)')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s
      .setName('sheet')
      .setDescription('Google Sheet mit der Auszahlungsliste verbinden')
      .addStringOption((o) => o.setName('link').setDescription('Link zum Google Sheet (am besten direkt vom richtigen Blatt)').setRequired(true))
      .addStringOption((o) => o.setName('blatt').setDescription('Welches Blatt? (Standard: aus dem Link bzw. automatisch)').setAutocomplete(true)))
    .addSubcommand((s) => s
      .setName('blatt')
      .setDescription('Anderes Blatt (Tab) im verbundenen Sheet verwenden')
      .addStringOption((o) => o.setName('name').setDescription('Blatt').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s
      .setName('kanal')
      .setDescription('Standard-Kanal für Event-Ankündigungen')
      .addChannelOption((o) => o.setName('kanal').setDescription('Textkanal').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s
      .setName('adminrolle')
      .setDescription('Rolle, die Events und Auszahlungen verwalten darf')
      .addRoleOption((o) => o.setName('rolle').setDescription('Rolle').setRequired(true)))
    .addSubcommand((s) => s.setName('info').setDescription('Einstellungen und erkannte Liste anzeigen')),

  async autocomplete(interaction) {
    const link = interaction.options.getString('link');
    const sheetId = (link && sheets.parseSheetLink(link)?.sheetId) || servers.get(interaction.guildId).sheetId;
    if (!sheetId) return interaction.respond([]);
    const typed = String(interaction.options.getFocused()).toLowerCase();
    const tabs = await sheets.listTabs(sheetId);
    await interaction.respond(tabs.filter((t) => t.title.toLowerCase().includes(typed)).slice(0, 25)
      .map((t) => ({ name: t.title.slice(0, 100), value: t.title.slice(0, 100) })));
  },

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '⛔ Nur Leute mit „Server verwalten“ können den Bot einrichten.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const email = sheets.serviceAccountEmail();

    if (sub === 'sheet' || sub === 'blatt') {
      let sheetId;
      let gid = null;
      if (sub === 'sheet') {
        const parsed = sheets.parseSheetLink(interaction.options.getString('link'));
        if (!parsed) {
          return interaction.reply({
            content: '⛔ Das sieht nicht nach einem Google-Sheet-Link aus. Beispiel: `https://docs.google.com/spreadsheets/d/1AbC.../edit#gid=0`',
            flags: MessageFlags.Ephemeral,
          });
        }
        ({ sheetId, gid } = parsed);
      } else {
        sheetId = servers.get(guildId).sheetId;
        if (!sheetId) return interaction.reply({ content: 'Zuerst `/setup sheet` ausführen.', flags: MessageFlags.Ephemeral });
      }
      const blatt = interaction.options.getString(sub === 'sheet' ? 'blatt' : 'name');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let liste;
      try {
        liste = blatt ? await sheets.load(sheetId, blatt) : await sheets.findTab(sheetId, gid);
      } catch (err) {
        const noAccess = /permission|not found|404|403/i.test(err.message);
        return interaction.editReply(noAccess
          ? `❌ Ich komme nicht an das Sheet ran (${err.message}).\n\n${shareHint(email)}\n\nDanach \`/setup sheet\` nochmal ausführen.`
          : `❌ ${err.message}`);
      }
      servers.set(guildId, { sheetId, tab: liste.tab });
      return interaction.editReply({ content: '✅ Liste verbunden. Das habe ich erkannt:', embeds: [summary(liste)] });
    }

    if (sub === 'kanal') {
      const kanal = interaction.options.getChannel('kanal');
      servers.set(guildId, { announceChannelId: kanal.id });
      return interaction.reply({ content: `✅ Events werden ab jetzt in ${kanal} angekündigt.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'adminrolle') {
      const rolle = interaction.options.getRole('rolle');
      servers.set(guildId, { adminRoleId: rolle.id });
      return interaction.reply({
        content: `✅ ${rolle} darf jetzt Events und Auszahlungen verwalten.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
      });
    }

    // info
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const s = servers.get(guildId);
    const embeds = [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚙️ Einstellungen')
      .addFields(
        { name: 'Liste', value: s.sheetId ? `Blatt „${s.tab}“` : '❌ nicht eingerichtet → `/setup sheet`', inline: true },
        { name: 'Ankündigungskanal', value: s.announceChannelId ? `<#${s.announceChannelId}>` : 'Kanal des Befehls', inline: true },
        { name: 'Admin-Rolle', value: s.adminRoleId ? `<@&${s.adminRoleId}>` : 'nur „Server verwalten“', inline: true },
        { name: 'Bot-E-Mail zum Teilen', value: email ? `\`${email}\`` : '⚠️ Google-Schlüssel fehlt' },
      )];
    if (s.sheetId) {
      try {
        embeds.push(summary(await sheets.load(s.sheetId, s.tab)));
      } catch (err) {
        embeds[0].addFields({ name: '⚠️ Liste nicht lesbar', value: err.message.slice(0, 1024) });
      }
    }
    return interaction.editReply({ embeds, allowedMentions: { parse: [] } });
  },
};
