// Arbeitet mit einer bestehenden Liste im Google Sheet (es werden keine Blätter angelegt):
//
//   A               | B         | C        | ... | Auszahlung offen | Sanktionen | ausgezahlt
//   (Titel)         | 40er 50k  | WF 40k   | ... |                  |            |
//   Name | 12345    | 1         | 3        | ... | $340.000         |            | 50000
//
// - Spalte A: Spieler als "Name | ID" (auch "Name I ID" oder "Name / ID")
// - Event-Spalten: Name + Betrag pro Teilnahme im Kopf ("Staatliche 25k", "Biz 100k"); Zellen = Anzahl Teilnahmen
// - "Auszahlung offen" wird nur gelesen (meist eine Formel), "Sanktionen" und "ausgezahlt" werden hochgezählt
const { createSheetsClient } = require('./google');
const config = require('./config');

let api = null;
function client() {
  if (!api) api = createSheetsClient(config.sheets.loadCredentials());
  return api;
}

// Schreibvorgänge nacheinander, damit gleichzeitige Änderungen sich nicht überschreiben
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

const quote = (tab) => `'${String(tab).replace(/'/g, "''")}'`;

/** Betrag aus einem Spaltenkopf: "40er 50k" → 50000, "Biz 100k" → 100000, "Bonus 1,5m" → 1500000. */
function parseAmount(header) {
  const m = String(header ?? '').trim().match(/(\d+(?:[.,]\d+)?)\s*(k|tsd\.?|m|mio\.?)?\s*\$?$/i);
  if (!m) return null;
  let n = Number(m[1].replace(',', '.'));
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit.startsWith('tsd')) n *= 1_000;
  else if (unit === 'm' || unit.startsWith('mio')) n *= 1_000_000;
  return n > 0 ? Math.round(n) : null;
}

/** Spieler aus Spalte A: "Cristina Diaz I 4358" → { name: 'Cristina Diaz', id: '4358' }. */
function parsePlayer(cell) {
  const s = String(cell ?? '').trim();
  if (!s) return null;
  const m = s.match(/(\d+)\s*$/);
  if (!m) return { name: s, id: null, label: s };
  const name = s.slice(0, m.index).replace(/[\s|/\\:-]+$/, '').replace(/\s+I$/, '').trim();
  return { name: name || s, id: m[1], label: s };
}

/** Zahl aus einer Zelle ("$340.000", 1, "" …). */
function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  return Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
}

function classify(header) {
  const h = String(header ?? '').trim();
  if (!h) return null;
  if (/offen/i.test(h)) return { kind: 'offen' };
  if (/sanktion/i.test(h)) return { kind: 'sanktion' };
  if (/ausgezahlt|bezahlt/i.test(h)) return { kind: 'ausgezahlt' };
  const amount = parseAmount(h);
  return amount ? { kind: 'event', amount } : null;
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Eine eingelesene Liste mit Spielern, Event-Spalten und Summen. */
class Liste {
  constructor(spreadsheetId, tab, rows) {
    this.spreadsheetId = spreadsheetId;
    this.tab = tab;
    this.rows = rows;

    // Kopfzeile = erste Zeile (in den ersten 10) mit mindestens 2 Event-Spalten
    this.headerIndex = rows.slice(0, 10).findIndex((r) => (r || []).slice(1).filter((c) => classify(c)?.kind === 'event').length >= 2);
    if (this.headerIndex < 0) {
      throw new Error(`Im Blatt "${tab}" wurde keine Kopfzeile mit Event-Spalten gefunden (z.B. "Staatliche 25k", "Biz 100k").`);
    }
    const header = rows[this.headerIndex];
    this.title = String(header[0] ?? '').trim();
    this.events = [];
    this.cols = {};
    header.forEach((h, col) => {
      if (col === 0) return;
      const c = classify(h);
      if (!c) return;
      if (c.kind === 'event') this.events.push({ col, name: String(h).trim(), amount: c.amount });
      else if (this.cols[c.kind] == null) this.cols[c.kind] = col;
    });

    this.players = [];
    for (let i = this.headerIndex + 1; i < rows.length; i++) {
      const p = parsePlayer(rows[i]?.[0]);
      if (p) this.players.push({ ...p, row: i + 1 });
    }
  }

  cell(row, col) {
    return this.rows[row - 1]?.[col] ?? '';
  }

  event(name) {
    return this.events.find((e) => norm(e.name) === norm(name)) || null;
  }

  byId(id) {
    return id == null ? null : this.players.find((p) => p.id === String(id).trim()) || null;
  }

  byName(name) {
    return this.players.find((p) => norm(p.name) === norm(name) || norm(p.label) === norm(name)) || null;
  }

  /** Teilnahmen und Beträge eines Spielers. */
  stats(player) {
    const counts = this.events
      .map((e) => ({ ...e, count: num(this.cell(player.row, e.col)) }))
      .filter((e) => e.count);
    const earned = counts.reduce((s, e) => s + e.count * e.amount, 0);
    const ausgezahlt = this.cols.ausgezahlt != null ? num(this.cell(player.row, this.cols.ausgezahlt)) : 0;
    const sanktion = this.cols.sanktion != null ? num(this.cell(player.row, this.cols.sanktion)) : 0;
    const offenCell = this.cols.offen != null ? this.cell(player.row, this.cols.offen) : '';
    const offen = offenCell !== '' ? num(offenCell) : earned - ausgezahlt - sanktion;
    return { counts, earned, ausgezahlt, sanktion, offen };
  }

  url() {
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
  }
}

/** Alle Tabellenblätter eines Sheets: [{ title, sheetId }]. */
async function listTabs(spreadsheetId) {
  const res = await client().spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  return res.data.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId }));
}

/** Liest eine Liste frisch aus dem Sheet. */
async function load(spreadsheetId, tab) {
  const res = await client().spreadsheets.values.get({
    spreadsheetId,
    range: quote(tab),
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return new Liste(spreadsheetId, tab, res.data.values || []);
}

/** Findet das passende Blatt: per gid aus dem Link, sonst das erste Blatt mit erkennbarer Liste. */
async function findTab(spreadsheetId, gid = null) {
  const tabs = await listTabs(spreadsheetId);
  const byGid = gid != null ? tabs.find((t) => String(t.sheetId) === String(gid)) : null;
  for (const t of byGid ? [byGid] : tabs) {
    try {
      return await load(spreadsheetId, t.title);
    } catch { /* Blatt hat kein passendes Format */ }
  }
  throw new Error(byGid
    ? `Im Blatt "${byGid.title}" wurde keine passende Liste gefunden.`
    : 'In keinem Blatt wurde eine passende Liste gefunden (Kopfzeile mit z.B. "Staatliche 25k").');
}

async function writeCells(liste, cells) {
  if (!cells.length) return;
  await client().spreadsheets.values.batchUpdate({
    spreadsheetId: liste.spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: cells.map(({ row, col, value }) => ({ range: `${quote(liste.tab)}!${colLetter(col)}${row}`, values: [[value]] })),
    },
  });
}

/** Zählt die Teilnahmen eines Events für mehrere Spieler hoch (Spieler-IDs oder Zeilennummern). */
function addEventCounts(spreadsheetId, tab, eventName, players, delta = 1) {
  return serialized(async () => {
    const liste = await load(spreadsheetId, tab);
    const ev = liste.event(eventName);
    if (!ev) throw new Error(`Die Spalte "${eventName}" gibt es im Blatt "${tab}" nicht (mehr).`);
    const cells = [];
    const credited = [];
    for (const ref of players) {
      const p = typeof ref === 'object' ? liste.players.find((x) => x.row === ref.row) : liste.byId(ref);
      if (!p) continue;
      const value = Math.max(0, num(liste.cell(p.row, ev.col)) + delta);
      cells.push({ row: p.row, col: ev.col, value });
      credited.push({ ...p, count: value });
    }
    await writeCells(liste, cells);
    return { event: ev, credited };
  });
}

/** Addiert einen Betrag in der Spalte "ausgezahlt" oder "Sanktionen". */
function addAmount(spreadsheetId, tab, kind, playerId, amount) {
  return serialized(async () => {
    const liste = await load(spreadsheetId, tab);
    const col = liste.cols[kind];
    if (col == null) throw new Error(`Im Blatt "${tab}" gibt es keine Spalte "${kind === 'sanktion' ? 'Sanktionen' : 'ausgezahlt'}".`);
    const p = liste.byId(playerId);
    if (!p) throw new Error(`Spieler-ID ${playerId} steht nicht in der Liste.`);
    const before = num(liste.cell(p.row, col));
    await writeCells(liste, [{ row: p.row, col, value: before + amount }]);
    return { player: p, before, after: before + amount };
  });
}

/** Trägt einen neuen Spieler unter dem letzten Spieler in Spalte A ein. */
function appendPlayer(spreadsheetId, tab, name, id) {
  return serialized(async () => {
    const liste = await load(spreadsheetId, tab);
    if (liste.byId(id)) throw new Error(`Die Spieler-ID ${id} steht schon in der Liste.`);
    const last = liste.players.at(-1)?.row ?? liste.headerIndex + 1;
    let row = last + 1;
    while (String(liste.cell(row, 0)).trim()) row++;
    await writeCells(liste, [{ row, col: 0, value: `${name} | ${id}` }]);
    return { name, id: String(id), row };
  });
}

/** Liest die Sheet-ID (und ggf. das Blatt per gid) aus einem Link. */
function parseSheetLink(input) {
  const s = String(input).trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1] ?? null;
  if (m) return { sheetId: m[1], gid };
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? { sheetId: s, gid: null } : null;
}

/** E-Mail-Adresse des Google-Dienstkontos – mit ihr muss jedes Sheet geteilt werden. */
function serviceAccountEmail() {
  try {
    return config.sheets.loadCredentials().client_email;
  } catch {
    return null;
  }
}

module.exports = {
  load, listTabs, findTab, addEventCounts, addAmount, appendPlayer,
  parseSheetLink, parseAmount, parsePlayer, num, serviceAccountEmail, colLetter,
};
