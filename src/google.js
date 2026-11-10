// Minimaler Google-Sheets-Client ohne externe Pakete (nur Node-Bordmittel).
// Spart das große Google-Paket ein – wichtig für Gratis-Hoster mit wenig RAM.
const crypto = require('node:crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Holt per Dienstkonto (JWT) ein Zugriffstoken und erneuert es automatisch. */
function createTokenProvider(credentials) {
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error('Google-Zugangsdaten unvollständig (client_email / private_key fehlt).');
  }
  let token = null;
  let expiresAt = 0;

  return async function getToken() {
    if (token && Date.now() < expiresAt - 60_000) return token;
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: credentials.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
    }));
    const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(credentials.private_key, 'base64url');

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google-Anmeldung fehlgeschlagen: ${data.error_description || data.error || res.status}`);
    token = data.access_token;
    expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return token;
  };
}

/** Erstellt einen Client mit derselben Form wie das offizielle Paket (nur die genutzten Methoden). */
function createSheetsClient(credentials) {
  const getToken = createTokenProvider(credentials);

  async function call(method, path, query = {}, body) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null)).toString();
    const res = await fetch(`${API}/${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Sheets: ${data.error?.message || `HTTP ${res.status}`}`);
    return { data };
  }

  const id = (p) => encodeURIComponent(p.spreadsheetId);
  const range = (p) => encodeURIComponent(p.range);

  return {
    spreadsheets: {
      get: (p) => call('GET', id(p), { fields: p.fields }),
      batchUpdate: (p) => call('POST', `${id(p)}:batchUpdate`, {}, p.requestBody),
      values: {
        get: (p) => call('GET', `${id(p)}/values/${range(p)}`, { valueRenderOption: p.valueRenderOption }),
        update: (p) => call('PUT', `${id(p)}/values/${range(p)}`, { valueInputOption: p.valueInputOption }, p.requestBody),
        append: (p) => call('POST', `${id(p)}/values/${range(p)}:append`,
          { valueInputOption: p.valueInputOption, insertDataOption: p.insertDataOption }, p.requestBody),
        batchUpdate: (p) => call('POST', `${id(p)}/values:batchUpdate`, {}, p.requestBody),
      },
    },
  };
}

module.exports = { createSheetsClient };
