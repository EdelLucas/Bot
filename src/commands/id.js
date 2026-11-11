const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const sheets = require('../sheets');
const servers = require('../servers');
const events = require('../events');
const { isAdmin, denyUnlessAdmin } = require('../permissions');
const { currentList, playerChoices, requirePlayer } = require('../lookup');
const { money } = require('../format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('id')
    .setDescription('Dein Discord-Konto mit deinem Eintrag in der Liste verknüpfen')
    .setDMPermission(false)
    .addSubcommand((s) => s
      .setName('setzen')
      .setDescription('Wähle dich in der Liste aus (Admins: auch für andere)')
      .addStringOption((o) => o.setName('spieler').setDescription('Name oder ID tippen und auswählen').setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName('benutzer').setDescription('Nur Admins: für wen?')))
    .addSubcommand((s) => s
      .setName('anzeigen')
      .setDescription('Mit wem ist ein Discord-Konto verknüpft?')
      .addUserOption((o) => o.setName('benutzer').setDescription('Standard: du')))
    .addSubcommand((s) => s
      .setName('hinzufuegen')
      .setDescription('Admins: neuen Spieler unten in die Liste eintragen')
      .addStringOption((o) => o.setName('name').setDescription('Name, z.B. Max Muster').setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName('spieler_id').setDescription('Spieler-ID (Zahl)').setRequired(true).setMaxLength(20))
      .addUserOption((o) => o.setName('benutzer').setDescription('Optional: gleich mit diesem Discord-Konto verknüpfen')))
    .addSubcommand((s) => s
      .setName('entfernen')
      .setDescription('Admins: Spieler aus der Liste löschen (ganze Zeile)')
      .addStringOption((o) => o.setName('spieler').setDescription('Name oder ID tippen und auswählen').setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName('bestaetigen').setDescription('Nötig, wenn der Spieler noch Geld offen hat'))),

  async autocomplete(interaction) {
    const liste = await currentList(interaction.guildId);
    await interaction.respond(playerChoices(liste, interaction.options.getFocused()));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const target = interaction.options.getUser('benutzer') ?? interaction.user;
    const member = interaction.options.getMember('benutzer') ?? interaction.member;

    if (sub === 'anzeigen') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const liste = await currentList(guildId);
      const p = events.resolvePlayer(liste, guildId, { id: target.id, name: member?.displayName ?? target.username });
      const linked = servers.getPlayerId(guildId, target.id);
      return interaction.editReply({
        content: p
          ? `🆔 ${target} ist **${p.label}**${linked ? '' : ' (automatisch über den Namen erkannt)'}.`
          : `${target} ist noch mit keinem Eintrag in der Liste verknüpft → \`/id setzen\`.`,
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'hinzufuegen') {
      if (await denyUnlessAdmin(interaction)) return;
      const name = interaction.options.getString('name').trim();
      const spielerId = interaction.options.getString('spieler_id').trim();
      if (!/^\d+$/.test(spielerId)) return interaction.reply({ content: '⛔ Die Spieler-ID muss eine Zahl sein.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const { sheetId, tab } = servers.sheetOf(guildId);
      const added = await sheets.appendPlayer(sheetId, tab, name, spielerId);
      const linkUser = interaction.options.getUser('benutzer');
      if (linkUser) servers.setPlayerId(guildId, linkUser.id, spielerId);
      return interaction.editReply(`✅ **${name} | ${spielerId}** in Zeile ${added.row} eingetragen${linkUser ? ` und mit ${linkUser} verknüpft` : ''}.`);
    }

    if (sub === 'entfernen') {
      if (await denyUnlessAdmin(interaction)) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const liste = await currentList(guildId);
      const player = requirePlayer(liste, interaction.options.getString('spieler'));
      const { offen } = liste.stats(player);
      if (offen > 0 && !interaction.options.getBoolean('bestaetigen')) {
        return interaction.editReply(
          `⚠️ **${player.label}** hat noch **${money(offen)}** offen. Erst auszahlen (\`/auszahlung erledigt\`) ` +
          'oder zum Löschen trotzdem nochmal mit `bestaetigen:True` ausführen.');
      }
      const { sheetId, tab } = servers.sheetOf(guildId);
      await sheets.removePlayer(sheetId, tab, player.id);
      const unlinked = servers.unlinkPlayer(guildId, player.id);
      return interaction.editReply(
        `🗑️ **${player.label}** wurde aus der Liste entfernt (Zeile ${player.row}).` +
        (offen > 0 ? ` Offener Betrag ${money(offen)} wurde mit gelöscht.` : '') +
        (unlinked ? ` ${unlinked} Discord-Verknüpfung(en) aufgehoben.` : ''));
    }

    // setzen
    const admin = isAdmin(interaction);
    if (target.id !== interaction.user.id && !admin) {
      return interaction.reply({ content: '⛔ Nur Admins können andere verknüpfen.', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const liste = await currentList(guildId);
    const player = requirePlayer(liste, interaction.options.getString('spieler'));
    if (!player.id) return interaction.editReply('⛔ Dieser Eintrag hat keine Spieler-ID in der Liste.');

    const others = servers.discordIdsOf(guildId, player.id).filter((id) => id !== target.id);
    if (others.length && !admin) {
      return interaction.editReply(`⛔ **${player.label}** ist schon mit einem anderen Discord-Konto verknüpft. Melde dich bei einem Admin.`);
    }
    servers.setPlayerId(guildId, target.id, player.id);
    const nachgetragen = await events.creditPending(guildId, target.id);

    await interaction.editReply({
      content: `✅ ${target} ist jetzt **${player.label}**.` +
        (nachgetragen.length ? `\n${nachgetragen.length} Event-Teilnahme(n) wurden nachgetragen.` : '') +
        (others.length ? `\n⚠️ Hinweis: Auch ${others.map((id) => `<@${id}>`).join(', ')} ist mit diesem Eintrag verknüpft.` : ''),
      allowedMentions: { parse: [] },
    });
  },
};
