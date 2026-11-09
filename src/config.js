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

const optional = (name, fallback = null) => process.env[name]?.trim() || fallback;

function loadGoogleCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  const file = optional('GOOGLE_CREDENTIALS_FILE', './credentials.json');
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
    guildId: optional('DISCORD_GUILD_ID'),
    adminRoleId: optional('ADMIN_ROLE_ID'),
    announceChannelId: optional('ANKUENDIGUNG_KANAL_ID'),
  },
  sheets: {
    get sheetId() { return required('GOOGLE_SHEET_ID'); },
    loadCredentials: loadGoogleCredentials,
  },
  payout: {
    // Mindestanwesenheit im Call in Prozent der Eventdauer (wenn beim Event keine Minuten angegeben sind)
    minPercent: Number(optional('MIN_ANWESENHEIT_PROZENT', '50')),
    currency: optional('WAEHRUNG', '$'),
  },
  timezone: optional('ZEITZONE', 'Europe/Berlin'),
  trackingFile: path.resolve(process.cwd(), optional('TRACKING_DATEI', 'data/tracking.json')),
};
