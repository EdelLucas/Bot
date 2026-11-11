# Discord Auszahlungs-Bot

Discord-Bot für Events und Auszahlungen. Er arbeitet direkt mit eurer **bestehenden Auszahlungsliste** in Google Sheets. Er legt keine eigenen Blätter an, sondern zählt in eurer Liste hoch.

- **Events ankündigen:** Event-Art aus der Liste wählen (z.B. „Staatliche 25k“), Startzeit, Voice-Call, optional mit Rollen-Ping
- **Calls prüfen:** Während des Events erfasst der Bot, wer wie lange im Voice-Call ist
- **Automatisch eintragen:** Wer lange genug im Call war, bekommt in der Spalte des Events **+1**
- **Auszahlen und Sanktionen:** Beträge landen in den Spalten „ausgezahlt“ und „Sanktionen“. „Auszahlung offen“ wird nur gelesen
- **Regelmäßige Events:** z.B. Mo–Fr 20:00 „Staatliche 25k“. Wird automatisch angekündigt, gestartet und eingetragen
- **Auszahlungsliste:** Der Bot liest die Liste aus und postet alle mit offenem Betrag, auf Wunsch automatisch. Admins haken per Auswahlmenü ab, dann wird „ausgezahlt“ eingetragen
- **Mehrere Server:** Jeder Discord-Server verbindet mit `/setup sheet` seine eigene Liste

## So muss die Liste aussehen

| A | B | C | … | | | |
|---|---|---|---|---|---|---|
| *(Titel, z.B. MAUSPARKPLATZ)* | **40er 50k** | **Staatliche 25k** | … | **Auszahlung offen** | **Sanktionen** | **ausgezahlt** |
| Aiden Akh \| 4823 | | 4 | … | $340.000 | | 50000 |
| Cristina Diaz I 4358 | 1 | 10 | … | $140.000 | | 1340000 |

- **Kopfzeile:** Jede Spalte, deren Name mit einem Betrag endet (`50k`, `100k`, `250k`, `1,5m`, `5000`), ist eine **Event-Art**. Der Betrag gilt pro Teilnahme.
- **Spalte A:** Spieler als `Name | ID` (auch `Name I ID` oder `Name / ID`).
- **Zellen:** Wie oft der Spieler bei dem Event dabei war.
- **„Auszahlung offen“:** wird nur gelesen. Am besten eine Formel wie `=B2*50000+C2*40000+…-S2-T2`. Fehlt die Spalte, rechnet der Bot selbst (Anzahl × Betrag − Sanktionen − ausgezahlt).
- **„Sanktionen“ / „ausgezahlt“:** Hier addiert der Bot Beträge bei `/auszahlung sanktion` bzw. `/auszahlung erledigt`.
- Weitere Spalten (Notizen o.ä.) stören nicht. Spalten ohne Betrag im Namen ignoriert der Bot.

## Ablauf

```
/event ankuendigen art:"Staatliche 25k"  ──►  Bot postet Ankündigung (+ Ping)
        │
   Startzeit erreicht  ──►  Bot startet die Call-Erfassung automatisch (oder /event start)
        │
   Dauer abgelaufen    ──►  automatisch Ende (oder /event ende)
        │
        ▼
Genug Minuten im Call   ──►  Spalte "Staatliche 25k" in der Zeile des Spielers +1
Nicht in der Liste      ──►  Hinweis im Kanal, wird nachgetragen sobald /id setzen
```

**Wie erkennt der Bot, wer wer ist?** In dieser Reihenfolge:
1. Verknüpfung per `/id setzen`, wo man sich selbst aus der Liste auswählt
2. Der Discord-Anzeigename ist genau der Name in der Liste, z.B. „Aiden Akh“
3. Die Spieler-ID steht im Discord-Namen, z.B. „Aiden | 4823“

## Commands

### Einrichtung pro Server („Server verwalten“)
| Command | Beschreibung |
|---|---|
| `/setup sheet link [blatt]` | Liste verbinden. Am besten den Link direkt vom richtigen Blatt kopieren, sonst sucht der Bot das passende Blatt |
| `/setup blatt name` | Anderes Blatt im selben Sheet verwenden |
| `/setup kanal kanal` | Standard-Kanal für Event-Ankündigungen |
| `/setup adminrolle rolle` | Rolle, die Events und Auszahlungen verwalten darf |
| `/setup info` | Zeigt Einstellungen, Bot-E-Mail und was der Bot in der Liste erkannt hat |

### Für alle
| Command | Beschreibung |
|---|---|
| `/id setzen spieler` | Sich selbst in der Liste auswählen (Vorschläge beim Tippen) |
| `/id anzeigen [benutzer]` | Mit welchem Eintrag ist jemand verknüpft? |
| `/auszahlung meine` | Eigene Teilnahmen und offener Betrag |
| `/event liste [alle]` | Kommende/laufende Events |
| `/sheet` | Link zur Liste |

### Für Admins („Server verwalten“ oder die Admin-Rolle)
| Command | Beschreibung |
|---|---|
| `/event ankuendigen art start call [titel] [dauer] [min_minuten] [beschreibung] [ping] [post_kanal]` | Event ankündigen. `start` z.B. `20.11.2026 20:00`, `20.11. 20:00` oder `20:00` |
| `/event start event` | Event sofort starten (sonst automatisch zur Startzeit) |
| `/event teilnehmer event` | Live-Stand: wer ist wie lange im Call, wer wird eingetragen, wer fehlt in der Liste |
| `/event ende event` | Event beenden und eintragen (automatisch, wenn `dauer` gesetzt ist) |
| `/event abbrechen event` | Event absagen, nichts wird eingetragen |
| `/event serie anlegen art tage zeit call [dauer] [vorlauf] [titel] [min_minuten] [beschreibung] [ping] [post_kanal]` | Regelmäßiges Event, z.B. `tage:Mo-Fr zeit:20:00 dauer:30`. Ankündigung `vorlauf` Minuten vorher (Standard 60) |
| `/event serie liste` | Alle regelmäßigen Events |
| `/event serie loeschen serie` | Regelmäßiges Event löschen |
| `/auszahlung liste [kanal]` | Liste auslesen und Auszahlungsliste posten: alle mit offenem Betrag, darunter ein **Auswahlmenü zum Abhaken** (trägt den Betrag in „ausgezahlt“ ein) und ein 🔄-Knopf |
| `/auszahlung automatisch kanal tage zeit` | Auszahlungsliste regelmäßig automatisch posten, z.B. `tage:So zeit:18:00` |
| `/auszahlung automatisch_aus` | Automatisches Posten abschalten |
| `/auszahlung offen` | Alle offenen Beträge (nur für dich sichtbar) |
| `/auszahlung spieler spieler` | Übersicht eines Spielers |
| `/auszahlung eintragen spieler art [anzahl]` | Teilnahme von Hand eintragen (negativ = korrigieren) |
| `/auszahlung erledigt spieler [betrag]` | Ausgezahlt: Betrag (Standard: alles Offene) in „ausgezahlt“ addieren |
| `/auszahlung sanktion spieler betrag` | Betrag in „Sanktionen“ addieren |
| `/id setzen spieler benutzer` | Jemand anderen verknüpfen |
| `/id hinzufuegen name spieler_id [benutzer]` | Neuen Spieler unten in Spalte A eintragen |
| `/id entfernen spieler [bestaetigen]` | Spieler aus der Liste löschen (ganze Zeile). Hat er noch Geld offen, muss man `bestaetigen:True` setzen |

**Wer wird eingetragen?** Jeder, der mindestens `min_minuten` im Call war. Ohne Angabe gelten `MIN_ANWESENHEIT_PROZENT` (Standard 50 %) der tatsächlichen Eventdauer. Rein- und Rausgehen wird zusammengezählt. Bots werden ignoriert.

**Was der Bot lokal speichert** (Ordner `data/`, beim Hoster **nicht löschen**): Einstellungen und Verknüpfungen pro Server (`servers.json`), Events, Serien und Auszahlungs-Zeitplan (`events.json`) und laufende Call-Erfassung (`tracking.json`).

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

### 3. Pro Server: Liste verbinden
1. Bot auf den Server einladen (Link aus Schritt 1.4)
2. Das Google Sheet mit der Liste → **Teilen** → Bot-E-Mail als **Bearbeiter** hinzufügen
3. Im Sheet das Blatt mit der Liste öffnen, den Link aus der Adresszeile kopieren
4. In Discord: `/setup sheet link:<Link>`. Der Bot zeigt an, welche Spieler und Event-Spalten er erkannt hat
5. Optional: `/setup kanal` und `/setup adminrolle`

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
├── servers.js          # Einstellungen + Verknüpfungen pro Discord-Server
├── eventstore.js       # Events, Serien, Auszahlungs-Zeitplan (lokal gespeichert)
├── payoutlist.js       # Auszahlungsliste mit Abhaken
├── lookup.js           # Auswahllisten für die Commands
├── google.js           # schlanker Google-Sheets-Client
├── sheets.js           # Liste lesen und hochzählen
├── tracker.js          # wer ist wie lange im Voice-Call
├── events.js           # Event starten/beenden, Teilnahmen eintragen, Zeitplaner
├── format.js           # Datum/Uhrzeit, Beträge
├── permissions.js      # Admin-Prüfung
└── commands/           # /setup, /event, /auszahlung, /id, /sheet
```

**Tage-Angaben** für Serien und die automatische Auszahlungsliste: `täglich`, `Mo-Fr`, `werktags`, `Wochenende`, `Mi,Sa`, `Fr-Mo`.
