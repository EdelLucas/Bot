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

/** Sucht im Projektordner eine JSON-Datei mit einem Google-Dienstkonto-Schlüssel (egal wie sie heißt). */
function findServiceAccountFile(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('package')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (data.type === 'service_account' && data.private_key) return path.join(dir, name);
    } catch { /* keine gültige JSON-Datei */ }
  }
  return null;
}

function loadGoogleCredentials() {
  if (process.env.GOOGLE_CREDENTIALS_JSON?.trim()) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  const file = optional('GOOGLE_CREDENTIALS_FILE', './credentials.json');
  let resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) {
    const found = findServiceAccountFile(process.cwd());
    if (!found) {
      throw new Error(
        `Google-Schlüssel nicht gefunden. Lade die JSON-Datei des Dienstkontos als "credentials.json" ` +
          `in den Hauptordner (${process.cwd()}) hoch – siehe README, Abschnitt "Google Sheet anbinden".`,
      );
    }
    console.log(`🔑 Google-Schlüssel gefunden: ${path.basename(found)}`);
    resolved = found;
  }
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (data.type !== 'service_account') {
    throw new Error(`${path.basename(resolved)} ist kein Dienstkonto-Schlüssel (erwartet "type": "service_account").`);
  }
  return data;
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
  autoRegisterCommands: optional('COMMANDS_AUTOMATISCH_REGISTRIEREN', 'true') !== 'false',
  trackingFile: path.resolve(process.cwd(), optional('TRACKING_DATEI', 'data/tracking.json')),
};
