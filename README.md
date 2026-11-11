# Discord Auszahlungs-Bot

Discord-Bot für Events und Auszahlungen. Alles landet in einem **Google Sheet**.

**Mehrere Server:** Der Bot kann auf beliebig vielen Discord-Servern gleichzeitig laufen. Jeder Server verbindet mit `/setup sheet` sein **eigenes** Sheet. Events, Auszahlungen und Spieler-IDs bleiben pro Server getrennt.

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

### Einrichtung pro Server („Server verwalten“)
| Command | Beschreibung |
|---|---|
| `/setup sheet link` | Google Sheet dieses Servers verbinden (vorher mit der Bot-E-Mail teilen) |
| `/setup kanal kanal` | Standard-Kanal für Event-Ankündigungen |
| `/setup adminrolle rolle` | Rolle, die Events und Auszahlungen verwalten darf |
| `/setup info` | Einstellungen und Bot-E-Mail anzeigen |

### Für alle
| Command | Beschreibung |
|---|---|
| `/id setzen spieler_id` | Eigene Spieler-ID hinterlegen (nötig für Auszahlungen) |
| `/id anzeigen [benutzer]` | Hinterlegte ID anzeigen |
| `/auszahlung meine` | Eigene offene Auszahlungen |
| `/event liste [alle]` | Kommende/laufende Events |
| `/sheet` | Link zum Google Sheet |

### Für Admins („Server verwalten“ oder die Admin-Rolle aus `/setup adminrolle`)
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

Die Tabellenblätter legt der Bot bei `/setup sheet` selbst an:

- **Auszahlungen:** ID · Datum · Event-ID · Event · Spieler-ID · Discord-Name · Discord-ID · Summe · Anwesenheit (Min) · Status · Quelle · Eingetragen von · Ausgezahlt am
- **Events:** ID · Name · Start · Dauer · Summe · Voice-Kanal · Status · Teilnehmer · …
- **Spieler:** Discord-ID · Discord-Name · Spieler-ID (Zuordnung Discord ↔ Spieler-ID)

Die Spalte *Summe* enthält echte Zahlen, damit man im Sheet direkt mit `=SUMME(...)` rechnen kann.

## Einrichtung

### 1. Discord-Bot anlegen
1. <https://discord.com/developers/applications> → **New Application**
2. **Bot** → *Reset Token* → Token kopieren → `DISCORD_TOKEN`
3. **General Information** → *Application ID* → `DISCORD_CLIENT_ID`
4. **OAuth2 → URL Generator**: Scopes `bot` + `applications.commands`. Rechte: `View Channels`, `Send Messages`, `Embed Links`, `Mention Everyone` (nur für Rollen-Pings). Mit diesem Link lädt man den Bot auf **jeden** Server ein, auf dem er laufen soll.

> Den Token **niemals** teilen, auch nicht im Chat. Wer ihn hat, kontrolliert den Bot. Falls er doch rausgegangen ist: *Reset Token* und den neuen in die `.env` eintragen.

Der Bot muss die Voice-Kanäle **sehen** können, sonst kann er die Teilnehmer nicht erfassen. Privilegierte Intents braucht er nicht.

### 2. Google-Schlüssel (einmal für den Bot)
1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen (keine Karte nötig)
2. **APIs & Dienste → Bibliothek** → *Google Sheets API* aktivieren
3. **IAM & Verwaltung → Dienstkonten** → Dienstkonto erstellen → *Schlüssel → JSON* herunterladen → in den Hauptordner des Bots legen (Name egal, z.B. `credentials.json`)

Die E-Mail-Adresse des Dienstkontos (`…@….iam.gserviceaccount.com`) ist die **Bot-E-Mail**. Mit ihr teilt jeder Server sein Sheet. Der Bot zeigt sie beim Start in der Konsole und in Discord mit `/setup info` an.

### 3. Pro Server: Sheet verbinden
1. Bot auf den Server einladen (Link aus Schritt 1.4)
2. Ein Google Sheet erstellen → **Teilen** → Bot-E-Mail als **Bearbeiter** hinzufügen
3. In Discord: `/setup sheet link:<Link zum Sheet>` → der Bot legt die Tabellenblätter an
4. Optional: `/setup kanal` und `/setup adminrolle`

Die Einstellungen speichert der Bot in `data/servers.json`. Diesen Ordner beim Hoster nicht löschen.

### 4. Starten
```bash
cp .env.example .env     # und ausfüllen
npm install
npm start                # registriert die Slash-Commands beim Start automatisch
```

👉 **Zum ersten Testen (auch vom Tablet):** siehe [docs/TESTEN.md](docs/TESTEN.md)

👉 **24/7 kostenlos hosten (z.B. auf Bot-Hosting.net, ohne Kreditkarte):** siehe [docs/HOSTING.md](docs/HOSTING.md)

Der Bot muss während des Events laufen, sonst kann er den Call nicht erfassen. Die laufende Erfassung wird in `data/tracking.json` gespeichert. Nach einem Neustart läuft sie weiter, nur die Zeit, in der der Bot offline war, wird niemandem angerechnet.

## Projektstruktur
```
src/
├── index.js            # Bot-Start, Events von Discord verteilen
├── deploy-commands.js  # Slash-Commands bei Discord registrieren
├── config.js           # .env lesen
├── servers.js          # Einstellungen pro Discord-Server (/setup)
├── google.js           # schlanker Google-Sheets-Client
├── sheets.js           # Google-Sheets-Zugriff (Tabellenblätter Auszahlungen/Events/Spieler)
├── tracker.js          # wer ist wie lange im Voice-Call
├── events.js           # Event starten/beenden, Auszahlungen erzeugen, Zeitplaner
├── format.js           # Datum/Uhrzeit, Beträge
├── permissions.js      # Admin-Prüfung
└── commands/           # /setup, /event, /auszahlung, /id, /sheet
```
