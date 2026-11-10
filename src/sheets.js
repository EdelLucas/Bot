const { createSheetsClient } = require('./google');
const config = require('./config');

let api = null;
function client() {
  if (!api) api = createSheetsClient(config.sheets.loadCredentials());
  return api;
}

// Alle Schreibvorgänge laufen nacheinander, damit bei gleichzeitigen Commands
// keine doppelten IDs entstehen und Zeilennummern stimmen.
let queue = Promise.resolve();
function serialized(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Ein Tabellenblatt im Sheet. Jede Zeile wird als Objekt { Spaltenname: Wert, _row } gelesen. */
class Table {
  constructor(title, columns, { autoId = true } = {}) {
    this.title = title;
    this.columns = columns;
    this.autoId = autoId; // Spalte "ID" automatisch hochzählen
    this.lastCol = colLetter(columns.length - 1);
    this.sheetId = null;
  }

  range(r) {
    return `'${this.title.replace(/'/g, "''")}'!${r}`;
  }

  toRow(entry) {
    return this.columns.map((c) => entry[c] ?? '');
  }

  async readAll() {
    const res = await client().spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range: this.range(`A2:${this.lastCol}`),
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    return (res.data.values || [])
      .map((row, i) => {
        const entry = { _row: i + 2 };
        this.columns.forEach((c, j) => { entry[c] = row[j] ?? ''; });
        return entry;
      })
      .filter((e) => this.columns.some((c) => e[c] !== ''));
  }

  async find(predicate) {
    return (await this.readAll()).filter(predicate);
  }

  addMany(items) {
    return serialized(async () => {
      if (!items.length) return [];
      const existing = await this.readAll();
      let next = existing.reduce((m, e) => Math.max(m, parseInt(e.ID, 10) || 0), 0) + 1;
      const entries = items.map((item) => (this.autoId ? { ...item, ID: next++ } : { ...item }));
      await client().spreadsheets.values.append({
        spreadsheetId: config.sheets.sheetId,
        range: this.range('A1'),
        valueInputOption: 'RAW', // RAW verhindert, dass Nutzer Formeln einschleusen
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: entries.map((e) => this.toRow(e)) },
      });
      return entries;
    });
  }

  async add(item) {
    return (await this.addMany([item]))[0];
  }

  /** Ändert alle Zeilen, auf die `predicate` zutrifft. `changes` = Objekt oder Funktion(entry) => Objekt. */
  update(predicate, changes) {
    return serialized(async () => {
      const matches = (await this.readAll()).filter(predicate);
      if (!matches.length) return [];
      const updated = matches.map((e) => ({ ...e, ...(typeof changes === 'function' ? changes(e) : changes) }));
      await client().spreadsheets.values.batchUpdate({
        spreadsheetId: config.sheets.sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updated.map((e) => ({ range: this.range(`A${e._row}`), values: [this.toRow(e)] })),
        },
      });
      return updated;
    });
  }

  /** Löscht alle Zeilen, auf die `predicate` zutrifft. */
  remove(predicate) {
    return serialized(async () => {
      const matches = (await this.readAll()).filter(predicate);
      if (!matches.length) return [];
      // von unten nach oben löschen, damit die Zeilennummern gültig bleiben
      const requests = [...matches]
        .sort((a, b) => b._row - a._row)
        .map((e) => ({
          deleteDimension: {
            range: { sheetId: this.sheetId, dimension: 'ROWS', startIndex: e._row - 1, endIndex: e._row },
          },
        }));
      await client().spreadsheets.batchUpdate({ spreadsheetId: config.sheets.sheetId, requestBody: { requests } });
      return matches;
    });
  }
}

const PAYOUT = { OFFEN: 'Offen', AUSGEZAHLT: 'Ausgezahlt', ID_FEHLT: 'ID fehlt' };
const EVENT = { GEPLANT: 'Geplant', LAEUFT: 'Läuft', BEENDET: 'Beendet', ABGEBROCHEN: 'Abgebrochen' };

const tables = {
  auszahlungen: new Table('Auszahlungen', [
    'ID', 'Datum', 'Event-ID', 'Event', 'Spieler-ID', 'Discord-Name', 'Discord-ID', 'Summe',
    'Anwesenheit (Min)', 'Status', 'Quelle', 'Eingetragen von', 'Ausgezahlt am',
  ]),
  events: new Table('Events', [
    'ID', 'Name', 'Start', 'Start (Unix)', 'Dauer (Min)', 'Min. Minuten', 'Summe', 'Voice-Kanal-ID',
    'Voice-Kanal', 'Post-Kanal-ID', 'Nachricht-ID', 'Status', 'Teilnehmer', 'Erstellt von', 'Beschreibung',
  ]),
  spieler: new Table('Spieler', ['Discord-ID', 'Discord-Name', 'Spieler-ID', 'Aktualisiert'], { autoId: false }),
};

/** Legt fehlende Tabellenblätter und Kopfzeilen an. Beim Start einmal aufrufen. */
async function init() {
  const sheets = client();
  const spreadsheetId = config.sheets.sheetId;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const existing = new Map(meta.data.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const all = Object.values(tables);

  const missing = all.filter((t) => !existing.has(t.title));
  if (missing.length) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: missing.map((t) => ({ addSheet: { properties: { title: t.title } } })) },
    });
    res.data.replies.forEach((r, i) => existing.set(missing[i].title, r.addSheet.properties.sheetId));
  }

  for (const t of all) {
    t.sheetId = existing.get(t.title);
    const header = await sheets.spreadsheets.values.get({ spreadsheetId, range: t.range(`A1:${t.lastCol}1`) });
    const current = header.data.values?.[0] || [];
    const isPrefix = current.every((c, i) => c === t.columns[i]);
    if (current.length < t.columns.length && isPrefix) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: t.range('A1'),
        valueInputOption: 'RAW',
        requestBody: { values: [t.columns] },
      });
    } else if (!isPrefix) {
      console.warn(`⚠️ Kopfzeile im Blatt "${t.title}" weicht ab – erwartet: ${t.columns.join(', ')}`);
    }
  }
}

const byId = (id) => (e) => String(e.ID) === String(id);

function url() {
  return `https://docs.google.com/spreadsheets/d/${config.sheets.sheetId}/edit`;
}

module.exports = { tables, init, url, byId, PAYOUT, EVENT };
