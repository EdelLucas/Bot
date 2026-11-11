// Auszahlungsliste: Bot liest die Liste aus, postet alle mit offenem Betrag und
// lässt Admins sie per Auswahlmenü als "ausgezahlt" abhaken (trägt in Spalte "ausgezahlt" ein).
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const sheets = require('./sheets');
const servers = require('./servers');
const { isAdmin } = require('./permissions');
const { money, clip, formatDate } = require('./format');

const SELECT_ID = 'auszahlung:abhaken';
const REFRESH_ID = 'auszahlung:aktualisieren';

/** Alle Spieler mit offenem Betrag, höchster zuerst. */
function openRows(liste) {
  return liste.players
    .filter((p) => p.id)
    .map((p) => ({ p, offen: liste.stats(p).offen }))
    .filter((r) => r.offen > 0)
    .sort((a, b) => b.offen - a.offen);
}

/** Nachricht mit Liste, Auswahlmenü (max. 25) und Aktualisieren-Knopf. */
function buildMessage(liste) {
  const rows = openRows(liste);
  const total = rows.reduce((s, r) => s + r.offen, 0);
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`💸 Auszahlungsliste – ${liste.title || liste.tab}`)
    .setURL(liste.url())
    .setDescription(rows.length
      ? clip(rows.map((r, i) => `${i + 1}. \`${r.p.id}\` ${r.p.name} – **${money(r.offen)}**`))
      : 'Alles ausgezahlt 🎉')
    .addFields(
      { name: 'Spieler', value: String(rows.length), inline: true },
      { name: 'Gesamt offen', value: money(total), inline: true },
    )
    .setFooter({ text: `Stand: ${formatDate()} · Admins: unten auswählen → wird als ausgezahlt eingetragen` });

  const components = [];
  if (rows.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(rows.length > 25 ? 'Ausgezahlt abhaken (Top 25 – Rest per /auszahlung erledigt)' : 'Ausgezahlt abhaken …')
        .addOptions(rows.slice(0, 25).map((r) => ({
          label: r.p.label.slice(0, 100),
          description: `offen: ${money(r.offen)}`.slice(0, 100),
          value: r.p.id,
        }))),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(REFRESH_ID).setLabel('Aktualisieren').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  ));
  return { embeds: [embed], components };
}

async function loadFor(guildId) {
  const { sheetId, tab } = servers.sheetOf(guildId);
  return sheets.load(sheetId, tab);
}

/** Postet die aktuelle Auszahlungsliste in einen Kanal. */
async function post(client, guildId, channelId) {
  const channel = await client.channels.fetch(String(channelId)).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('Kanal für die Auszahlungsliste nicht gefunden.');
  return channel.send(buildMessage(await loadFor(guildId)));
}

const isPayoutComponent = (interaction) => [SELECT_ID, REFRESH_ID].includes(interaction.customId);

/** Klick auf Auswahlmenü oder Aktualisieren-Knopf. */
async function handleComponent(interaction) {
  if (interaction.customId === SELECT_ID && !isAdmin(interaction)) {
    return interaction.reply({ content: '⛔ Nur Admins können Auszahlungen abhaken.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  let note = null;
  if (interaction.customId === SELECT_ID) {
    const playerId = interaction.values[0];
    const before = await loadFor(interaction.guildId);
    const player = before.byId(playerId);
    const offen = player ? before.stats(player).offen : 0;
    if (!player || offen <= 0) {
      note = 'Bei diesem Spieler ist nichts (mehr) offen.';
    } else {
      const { sheetId, tab } = servers.sheetOf(interaction.guildId);
      await sheets.addAmount(sheetId, tab, 'ausgezahlt', playerId, offen);
      note = `✅ ${money(offen)} an **${player.label}** als ausgezahlt eingetragen (von ${interaction.user}).`;
    }
  }
  await interaction.editReply(buildMessage(await loadFor(interaction.guildId)));
  if (note) await interaction.followUp({ content: note, allowedMentions: { parse: [] } });
}

module.exports = { buildMessage, post, openRows, isPayoutComponent, handleComponent };
