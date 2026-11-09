# Discord Sheet Bot

Ein Discord-Bot, der Slash-Commands entgegennimmt und die Daten in ein **Google Sheet** schreibt bzw. daraus liest.

## Commands

| Command | Beschreibung |
|---|---|
| `/eintrag inhalt:<text> [kategorie]` | Neuen Eintrag ins Sheet schreiben (bekommt eine fortlaufende ID) |
| `/liste [anzahl] [kategorie] [von]` | Die letzten Einträge anzeigen, optional gefiltert |
| `/suche begriff:<text>` | Einträge nach Inhalt, Kategorie oder Benutzer durchsuchen |
| `/bearbeiten id:<nr> [inhalt] [kategorie]` | Eintrag ändern |
| `/loeschen id:<nr>` | Eintrag löschen (Zeile wird aus dem Sheet entfernt) |
| `/sheet` | Link zum Google Sheet |

Bearbeiten/Löschen darf jeder bei **eigenen** Einträgen. Fremde Einträge nur Mitglieder mit „Nachrichten verwalten“ oder der in `ADMIN_ROLE_ID` gesetzten Rolle.

Das Sheet bekommt automatisch diese Spalten:

| ID | Datum | Benutzer | Benutzer-ID | Kategorie | Inhalt |
|---|---|---|---|---|---|

## Einrichtung

### 1. Discord-Bot anlegen
1. <https://discord.com/developers/applications> → **New Application**
2. **Bot** → *Reset Token* → Token kopieren → `DISCORD_TOKEN`
3. **General Information** → *Application ID* → `DISCORD_CLIENT_ID`
4. **OAuth2 → URL Generator**: Scopes `bot` + `applications.commands`, Berechtigung `Send Messages`, `Embed Links` → Link öffnen und Bot auf den Server einladen
5. Server-ID (Rechtsklick auf Server → *ID kopieren*, Entwicklermodus muss an sein) → `DISCORD_GUILD_ID`

### 2. Google Sheet anbinden
1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen
2. **APIs & Dienste → Bibliothek** → *Google Sheets API* aktivieren
3. **IAM & Verwaltung → Dienstkonten** → Dienstkonto erstellen → *Schlüssel → JSON* herunterladen → als `credentials.json` ins Projektverzeichnis legen
4. Google Sheet erstellen und mit der E-Mail des Dienstkontos (`…@….iam.gserviceaccount.com`) als **Bearbeiter** teilen
5. Sheet-ID aus der URL (`/spreadsheets/d/<ID>/edit`) → `GOOGLE_SHEET_ID`

### 3. Starten
```bash
cp .env.example .env     # und ausfüllen
npm install
npm run deploy           # Slash-Commands registrieren (einmalig + nach Änderungen)
npm start
```

## Anpassen

- **Neue Spalten:** in `src/sheets.js` das Array `COLUMNS` erweitern und den Wert in `src/commands/eintrag.js` befüllen.
- **Neuer Command:** Datei in `src/commands/` anlegen (Aufbau wie `sheet.js`), in `src/commands/index.js` eintragen, `npm run deploy` ausführen.

## Projektstruktur
```
src/
├── index.js            # Bot-Start, verteilt Interactions an die Commands
├── deploy-commands.js  # registriert Slash-Commands bei Discord
├── config.js           # liest .env
├── sheets.js           # Google-Sheets-Zugriff (lesen, anhängen, ändern, löschen)
└── commands/           # ein File pro Slash-Command
```
