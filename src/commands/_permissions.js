const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');

/** Eigene Einträge darf jeder ändern, fremde nur Moderatoren bzw. die Admin-Rolle. */
function canModify(interaction, entry) {
  if (entry['Benutzer-ID'] === interaction.user.id) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return true;
  const roles = interaction.member?.roles;
  if (config.discord.adminRoleId && roles) {
    // roles ist bei gecachten Mitgliedern ein Manager, sonst ein Array von IDs
    return Array.isArray(roles) ? roles.includes(config.discord.adminRoleId) : roles.cache.has(config.discord.adminRoleId);
  }
  return false;
}
module.exports = { canModify };
