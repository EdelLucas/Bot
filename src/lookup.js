// Gemeinsame Helfer für Commands: aktuelle Liste laden und Auswahllisten (Autovervollständigung) bauen.
const sheets = require('./sheets');
const servers = require('./servers');
const { money } = require('./format');

async function currentList(guildId) {
  const { sheetId, tab } = servers.sheetOf(guildId);
  return sheets.load(sheetId, tab);
}

const matches = (text, typed) => String(text).toLowerCase().includes(String(typed ?? '').toLowerCase().trim());

/** Spieler zur Auswahl: angezeigt wird "Name | ID", übergeben wird die ID. */
function playerChoices(liste, typed) {
  return liste.players
    .filter((p) => p.id && matches(p.label, typed))
    .slice(0, 25)
    .map((p) => ({ name: p.label.slice(0, 100), value: p.id }));
}

/** Event-Arten (Spalten) zur Auswahl. */
function eventChoices(liste, typed) {
  return liste.events
    .filter((e) => matches(e.name, typed))
    .slice(0, 25)
    .map((e) => ({ name: `${e.name} (${money(e.amount)} pro Teilnahme)`.slice(0, 100), value: e.name.slice(0, 100) }));
}

/** Spieler per ID (oder exaktem Namen) finden, sonst verständlicher Fehler. */
function requirePlayer(liste, input) {
  const p = liste.byId(input) || liste.byName(input);
  if (!p) throw new Error(`„${input}“ steht nicht in der Liste „${liste.tab}“. Bitte aus der Vorschlagsliste auswählen.`);
  return p;
}

function requireEvent(liste, input) {
  const e = liste.event(input);
  if (!e) throw new Error(`Die Spalte „${input}“ gibt es in der Liste nicht. Bitte aus der Vorschlagsliste auswählen.`);
  return e;
}

module.exports = { currentList, playerChoices, eventChoices, requirePlayer, requireEvent };
