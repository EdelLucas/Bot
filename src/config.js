const fs = require('node:fs');
const path = require('node:path');

// .env einlesen – tolerant, weil die Datei oft am Handy/Tablet angelegt wird:
// erlaubt "KEY=wert" und "KEY: wert", Anführungszeichen, Leerzeichen und die Namen env / .env.txt / env.txt
const ENV_FILES = ['.env', 'env', '.env.txt', 'env.txt', '.env.example.txt'];
function loadEnvFiles() {
  for (const name of ENV_FILES) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    let count = 0;
    for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
      if (value && !process.env[m[1]]) process.env[m[1]] = value; // Panel-Variablen haben Vorrang
      count++;
    }
    console.log(`📄 Einstellungen aus "${name}" geladen (${count} Einträge)`);
  }
}
loadEnvFiles();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    const files = fs.readdirSync(process.cwd()).filter((f) => /env/i.test(f));
    throw new Error(
      `${name} fehlt. Lege im Hauptordner (${process.cwd()}) eine Datei ".env" an mit der Zeile\n` +
      `   ${name}=dein-wert\n` +
      `Gefundene env-Dateien: ${files.length ? files.join(', ') : 'keine'}`,
    );
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

let cachedCredentials = null;

function loadGoogleCredentials() {
  if (cachedCredentials) return cachedCredentials;
  cachedCredentials = readGoogleCredentials();
  return cachedCredentials;
}

function readGoogleCredentials() {
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
    // Nur Vorgabe für den Server DISCORD_GUILD_ID – andere Server richten ihr Sheet mit /setup ein
    defaultSheetId: optional('GOOGLE_SHEET_ID'),
    loadCredentials: loadGoogleCredentials,
  },
  payout: {
    // Mindestanwesenheit im Call in Prozent der Eventdauer (wenn beim Event keine Minuten angegeben sind)
    minPercent: Number(optional('MIN_ANWESENHEIT_PROZENT', '50')),
    currency: optional('WAEHRUNG', '$'),
  },
  timezone: optional('ZEITZONE', 'Europe/Berlin'),
  autoRegisterCommands: optional('COMMANDS_AUTOMATISCH_REGISTRIEREN', 'true') !== 'false',
  dataDir: path.resolve(process.cwd(), optional('DATEN_ORDNER', 'data')),
  trackingFile: path.resolve(process.cwd(), optional('TRACKING_DATEI', 'data/tracking.json')),
};
