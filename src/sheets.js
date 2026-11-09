const { google } = require('googleapis');
const config = require('./config');

// Spaltenaufbau des Sheets. Reihenfolge = Spalten A, B, C, ...
// Zum Erweitern einfach hier eine Spalte ergänzen und in den Commands befüllen.
const COLUMNS = ['ID', 'Datum', 'Benutzer', 'Benutzer-ID', 'Kategorie', 'Inhalt'];
const LAST_COL = String.fromCharCode('A'.charCodeAt(0) + COLUMNS.length - 1);

let api = null;
let tabSheetId = null; // numerische ID des Tabs (für deleteDimension)

// Schreibvorgänge nacheinander ausführen, damit bei gleichzeitigen Commands
// keine doppelten IDs entstehen und Zeilennummern stimmen.
let queue = Promise.resolve();
function serialized(fn) {
  return (...args) => {
    const run = queue.then(() => fn(...args));
    queue = run.catch(() => {});
    return run;
  };
}

function quoteTab(tab) {
  return `'${tab.replace(/'/g, "''")}'`;
}
const range = (r) => `${quoteTab(config.sheets.tab)}!${r}`;

function client() {
  if (!api) {
    const credentials = config.sheets.loadCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    api = google.sheets({ version: 'v4', auth });
  }
  return api;
}

/** Legt den Tab (falls nötig) und die Kopfzeile an. Beim Start einmal aufrufen. */
async function init() {
  const sheets = client();
  const spreadsheetId = config.sheets.sheetId;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  let tab = meta.data.sheets.find((s) => s.properties.title === config.sheets.tab);

  if (!tab) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: config.sheets.tab } } }] },
    });
    tabSheetId = res.data.replies[0].addSheet.properties.sheetId;
  } else {
    tabSheetId = tab.properties.sheetId;
  }

  const header = await sheets.spreadsheets.values.get({ spreadsheetId, range: range(`A1:${LAST_COL}1`) });
  if (!header.data.values || header.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: range('A1'),
      valueInputOption: 'RAW',
      requestBody: { values: [COLUMNS] },
    });
  }
}

/** Liest alle Einträge (ohne Kopfzeile) als Objekte inkl. Zeilennummer. */
async function getAll() {
  const res = await client().spreadsheets.values.get({
    spreadsheetId: config.sheets.sheetId,
    range: range(`A2:${LAST_COL}`),
  });
  return (res.data.values || [])
    .map((row, i) => {
      const entry = { _row: i + 2 };
      COLUMNS.forEach((col, c) => { entry[col] = row[c] ?? ''; });
      return entry;
    })
    .filter((e) => e.ID !== '');
}

function nextId(entries) {
  const max = entries.reduce((m, e) => Math.max(m, parseInt(e.ID, 10) || 0), 0);
  return max + 1;
}

/** Hängt einen Eintrag an. `data` enthält die Spaltennamen als Keys. */
async function add(data) {
  const entries = await getAll();
  const entry = { ...data, ID: String(nextId(entries)) };
  await client().spreadsheets.values.append({
    spreadsheetId: config.sheets.sheetId,
    range: range('A1'),
    valueInputOption: 'RAW', // RAW verhindert, dass Nutzer Formeln einschleusen
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [COLUMNS.map((c) => entry[c] ?? '')] },
  });
  return entry;
}

async function findById(id) {
  const entries = await getAll();
  return entries.find((e) => e.ID === String(id)) || null;
}

/** Entfernt die Zeile des Eintrags komplett aus dem Sheet. */
async function remove(entry) {
  await client().spreadsheets.batchUpdate({
    spreadsheetId: config.sheets.sheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: tabSheetId,
            dimension: 'ROWS',
            startIndex: entry._row - 1,
            endIndex: entry._row,
          },
        },
      }],
    },
  });
}

/** Ändert einzelne Felder eines Eintrags. */
async function update(entry, changes) {
  const updated = { ...entry, ...changes };
  await client().spreadsheets.values.update({
    spreadsheetId: config.sheets.sheetId,
    range: range(`A${entry._row}`),
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS.map((c) => updated[c] ?? '')] },
  });
  return updated;
}

function url() {
  return `https://docs.google.com/spreadsheets/d/${config.sheets.sheetId}/edit`;
}

module.exports = {
  COLUMNS,
  init,
  getAll,
  findById,
  add: serialized(add),
  // Löschen/Ändern per ID, damit die Zeilennummer erst innerhalb der Warteschlange ermittelt wird
  removeById: serialized(async (id) => {
    const entry = await findById(id);
    if (entry) await remove(entry);
    return entry;
  }),
  updateById: serialized(async (id, changes) => {
    const entry = await findById(id);
    return entry ? update(entry, changes) : null;
  }),
  url,
};
