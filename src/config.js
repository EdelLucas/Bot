require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Umgebungsvariable ${name} fehlt. Siehe .env.example.`);
  }
  return value.trim();
}

function loadGoogleCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  const file = process.env.GOOGLE_CREDENTIALS_FILE || './credentials.json';
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Google-Zugangsdaten nicht gefunden (${resolved}). ` +
        'Setze GOOGLE_CREDENTIALS_FILE oder GOOGLE_CREDENTIALS_JSON.',
    );
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

module.exports = {
  discord: {
    get token() { return required('DISCORD_TOKEN'); },
    get clientId() { return required('DISCORD_CLIENT_ID'); },
    guildId: process.env.DISCORD_GUILD_ID?.trim() || null,
    adminRoleId: process.env.ADMIN_ROLE_ID?.trim() || null,
  },
  sheets: {
    get sheetId() { return required('GOOGLE_SHEET_ID'); },
    tab: process.env.GOOGLE_SHEET_TAB?.trim() || 'Einträge',
    loadCredentials: loadGoogleCredentials,
  },
};
