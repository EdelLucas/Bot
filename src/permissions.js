const { PermissionFlagsBits } = require('discord.js');
const config = require('./config');

/** Admin = Berechtigung "Server verwalten" oder die Rolle aus ADMIN_ROLE_ID. */
function isAdmin(interaction) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const roles = interaction.member?.roles;
  if (!config.discord.adminRoleId || !roles) return false;
  return Array.isArray(roles) ? roles.includes(config.discord.adminRoleId) : roles.cache.has(config.discord.adminRoleId);
}

async function denyUnlessAdmin(interaction) {
  if (isAdmin(interaction)) return false;
  await interaction.reply({ content: '⛔ Dafür brauchst du Admin-Rechte.', ephemeral: true });
  return true;
}

module.exports = { isAdmin, denyUnlessAdmin };
