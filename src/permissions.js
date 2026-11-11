const { PermissionFlagsBits } = require('discord.js');
const servers = require('./servers');

/** Admin = Berechtigung "Server verwalten" oder die per /setup festgelegte Admin-Rolle. */
function isAdmin(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const { adminRoleId } = servers.get(interaction.guildId);
  const roles = interaction.member?.roles;
  if (!adminRoleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(adminRoleId) : roles.cache.has(adminRoleId);
}

async function denyUnlessAdmin(interaction) {
  if (isAdmin(interaction)) return false;
  await interaction.reply({ content: '⛔ Dafür brauchst du Admin-Rechte.', ephemeral: true });
  return true;
}

module.exports = { isAdmin, denyUnlessAdmin };
