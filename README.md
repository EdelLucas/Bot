# Discord Auszahlungs-Bot

Discord-Bot für Events und Auszahlungen. Alles landet in einem **Google Sheet**.

- **Events ankündigen:** Ankündigung mit Startzeit, Voice-Call und Betrag, optional mit Rollen-Ping
- **Calls prüfen:** Während des Events erfasst der Bot, wer wie lange im Voice-Call ist
- **Automatisch auszahlen:** Wer zum Event-Ende lange genug im Call war, wird mit Spieler-ID und Summe in die Auszahlungsliste eingetragen
- **Manuelle Auszahlungen:** Spieler-ID, Event und Summe direkt eintragen

## Ablauf

```
/event ankuendigen  ──►  Bot postet Ankündigung (+ Ping)
        │
   Startzeit erreicht  ──►  Bot startet die Call-Erfassung automatisch (oder /event start)
        │                    und zählt Minuten pro Person im Voice-Kanal
        │
   Dauer abgelaufen    ──►  automatisch Ende (oder /event ende)
        │
        ▼
Alle mit genug Minuten im Call  ──►  Zeile im Blatt "Auszahlungen" (Status "Offen")
Ohne hinterlegte Spieler-ID     ──►  Status "ID fehlt", wird nachgetragen sobald /id setzen
```

## Commands

### Für alle
| Command | Beschreibung |
|---|---|
| `/id setzen spieler_id` | Eigene Spieler-ID hinterlegen (nötig für Auszahlungen) |
| `/id anzeigen [benutzer]` | Hinterlegte ID anzeigen |
| `/auszahlung meine` | Eigene offene Auszahlungen |
| `/event liste [alle]` | Kommende/laufende Events |
| `/sheet` | Link zum Google Sheet |

### Für Admins („Server verwalten“ oder `ADMIN_ROLE_ID`)
| Command | Beschreibung |
|---|---|
| `/event ankuendigen name start summe call [dauer] [min_minuten] [beschreibung] [ping] [post_kanal]` | Event ankündigen. `start` z.B. `20.11.2026 20:00`, `20.11. 20:00` oder `20:00` |
| `/event start event` | Event sofort starten (sonst automatisch zur Startzeit) |
| `/event teilnehmer event` | Live-Stand: wer ist wie lange im Call, wer bekommt eine Auszahlung |
| `/event ende event` | Event beenden und Auszahlungen eintragen (automatisch, wenn `dauer` gesetzt ist) |
| `/event abbrechen event` | Event absagen, keine Auszahlungen |
| `/auszahlung hinzufuegen spieler_id event summe` | Auszahlung manuell eintragen |
| `/auszahlung liste [status] [event] [spieler_id]` | Auszahlungen anzeigen (Standard: offene) |
| `/auszahlung offen` | Offene Beträge pro Spieler-ID zusammengerechnet |
| `/auszahlung erledigt [eintrag] [spieler_id] [event]` | Als ausgezahlt markieren, z.B. alle offenen einer Spieler-ID |
| `/auszahlung loeschen eintrag` | Eintrag löschen |
| `/id setzen spieler_id benutzer` | ID für jemand anderen setzen |

**Wer bekommt eine Auszahlung?** Jeder, der mindestens `min_minuten` im Call war. Ohne Angabe gelten `MIN_ANWESENHEIT_PROZENT` (Standard 50 %) der tatsächlichen Eventdauer. Rein- und Rausgehen wird zusammengezählt. Bots werden ignoriert.

## Aufbau des Sheets

Die Tabellenblätter legt der Bot beim Start selbst an:

- **Auszahlungen:** ID · Datum · Event-ID · Event · Spieler-ID · Discord-Name · Discord-ID · Summe · Anwesenheit (Min) · Status · Quelle · Eingetragen von · Ausgezahlt am
- **Events:** ID · Name · Start · Dauer · Summe · Voice-Kanal · Status · Teilnehmer · …
- **Spieler:** Discord-ID · Discord-Name · Spieler-ID (Zuordnung Discord ↔ Spieler-ID)

Die Spalte *Summe* enthält echte Zahlen, damit man im Sheet direkt mit `=SUMME(...)` rechnen kann.

## Einrichtung

### 1. Discord-Bot anlegen
1. <https://discord.com/developers/applications> → **New Application**
2. **Bot** → *Reset Token* → Token kopieren → `DISCORD_TOKEN`
3. **General Information** → *Application ID* → `DISCORD_CLIENT_ID`
4. **OAuth2 → URL Generator**: Scopes `bot` + `applications.commands`. Rechte: `View Channels`, `Send Messages`, `Embed Links`, `Mention Everyone` (nur für Rollen-Pings). Link öffnen und Bot einladen.
5. Server-ID → `DISCORD_GUILD_ID`, Ankündigungskanal-ID → `ANKUENDIGUNG_KANAL_ID` (Rechtsklick → *ID kopieren*, Entwicklermodus muss an sein)

Der Bot muss die Voice-Kanäle **sehen** können, sonst kann er die Teilnehmer nicht erfassen. Privilegierte Intents braucht er nicht.

### 2. Google Sheet anbinden
1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen
2. **APIs & Dienste → Bibliothek** → *Google Sheets API* aktivieren
3. **IAM & Verwaltung → Dienstkonten** → Dienstkonto erstellen → *Schlüssel → JSON* herunterladen → als `credentials.json` ins Projektverzeichnis legen
4. Google Sheet erstellen und mit der E-Mail-Adresse des Dienstkontos (`…@….iam.gserviceaccount.com`) als **Bearbeiter** teilen
5. Sheet-ID aus der URL (`/spreadsheets/d/<ID>/edit`) → `GOOGLE_SHEET_ID`

### 3. Starten
```bash
cp .env.example .env     # und ausfüllen
npm install
npm run deploy           # Slash-Commands registrieren (einmalig + nach Änderungen)
npm start
```

👉 **24/7 kostenlos hosten:** siehe [docs/HOSTING.md](docs/HOSTING.md)

Der Bot muss während des Events laufen, sonst kann er den Call nicht erfassen. Die laufende Erfassung wird in `data/tracking.json` gespeichert. Nach einem Neustart läuft sie weiter, nur die Zeit, in der der Bot offline war, wird niemandem angerechnet.

## Projektstruktur
```
src/
├── index.js            # Bot-Start, Events von Discord verteilen
├── deploy-commands.js  # Slash-Commands bei Discord registrieren
├── config.js           # .env lesen
├── sheets.js           # Google-Sheets-Zugriff (Tabellenblätter Auszahlungen/Events/Spieler)
├── tracker.js          # wer ist wie lange im Voice-Call
├── events.js           # Event starten/beenden, Auszahlungen erzeugen, Zeitplaner
├── format.js           # Datum/Uhrzeit, Beträge
├── permissions.js      # Admin-Prüfung
└── commands/           # /event, /auszahlung, /id, /sheet
```
