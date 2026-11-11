# Bot testen – Schritt für Schritt vom Tablet

Alles geht im Browser des Tablets und in der Discord-App, einen PC brauchst du nicht. Plane etwa 30–45 Minuten ein.

**Überblick:**
1. Discord-Bot vorbereiten (5 Min)
2. Google-Schlüssel und Freigabe der Liste (10 Min)
3. Bot starten: **Weg A** (Wispbyte, geht mit jedem Tablet, auch iPad) **oder Weg B** (Termux, nur Android)
4. In Discord testen (10 Min)

---

## 1. Discord-Bot vorbereiten

1. Im Browser <https://discord.com/developers/applications> öffnen → deine App → **Bot**.
2. **Reset Token** → Token kopieren und erstmal in eine Notiz einfügen. *Niemandem zeigen, nicht in Chats posten.*
3. Auf derselben Seite runterscrollen. **Public Bot** darf an bleiben. Die „Privileged Gateway Intents“ brauchst du **nicht**.
4. Links **OAuth2** → **URL Generator**:
   - Scopes: ☑ `bot` ☑ `applications.commands`
   - Bot Permissions: ☑ View Channels ☑ Send Messages ☑ Embed Links ☑ Mention Everyone
   - Ganz unten den Link kopieren, im Browser öffnen, deinen Server wählen → **Autorisieren**.
5. Unter **General Information** die **Application ID** kopieren (in die Notiz).

## 2. Google-Schlüssel und Sheet

**Schlüssel** (nur einmal nötig):
1. <https://console.cloud.google.com/> öffnen. Am Tablet hilft es, im Browser-Menü **Desktop-Website anfordern** einzuschalten.
2. Oben auf die Projektauswahl → **Neues Projekt** → Name `Discord Bot` → Erstellen → Projekt auswählen.
3. Oben in die Suche **Google Sheets API** eingeben → **Aktivieren**.
4. Suche: **Dienstkonten** → **Dienstkonto erstellen** → Name `bot` → **Erstellen und fortfahren** → **Fertig**.
5. Auf das neue Dienstkonto tippen → Tab **Schlüssel** → **Schlüssel hinzufügen** → **Neuen Schlüssel erstellen** → **JSON** → Erstellen. Die Datei landet in deinen Downloads.
6. Die E-Mail des Dienstkontos notieren, die sieht so aus: `bot@discord-bot-12345.iam.gserviceaccount.com`. Das ist die **Bot-E-Mail**.

**Liste freigeben:**
1. Dein Google Sheet mit der Auszahlungsliste öffnen.
2. **Teilen** → Bot-E-Mail eintragen → Rolle **Bearbeiter** → Senden.
3. Zum Blatt mit der Liste wechseln (Tab unten) und den **Link** aus der Adresszeile kopieren. Er endet auf `#gid=…`, damit weiß der Bot, welches Blatt gemeint ist.

> Tipp: Zum ersten Testen eine **Kopie** der Liste verwenden (Datei → Kopie erstellen), dann kann in der echten Liste nichts schiefgehen.

---

## 3A. Bot starten mit Wispbyte (jedes Tablet, auch iPad)

**Code herunterladen:**
1. Im Browser <https://github.com/EdelLucas/Bot> öffnen (eingeloggt).
2. Oben links auf den Branch-Knopf (zeigt `main`) → `claude/discord-bot-sheet-commands-cgg4zl` wählen.
3. Grüner Knopf **Code** → **Download ZIP**. Die ZIP **nicht** entpacken.

**Hochladen:**
1. <https://wispbyte.com> → einloggen → Server (Node.js) öffnen → **Files** (Dateien).
2. Alte Dateien/Ordner löschen, **außer** dem Ordner `data`, falls vorhanden.
3. **Upload** → die ZIP auswählen → bei der ZIP **⋮ → Unarchive** (Entpacken) → danach die ZIP löschen.
4. Jetzt gibt es einen Ordner wie `Bot-claude-discord-bot-sheet-commands-cgg4zl`. Öffnen → **alles markieren** → **Move** (Verschieben) → als Ziel `/` bzw. `../` eingeben. Danach den leeren Ordner löschen.
   Ganz oben müssen jetzt `index.js`, `package.json` und `src` liegen.
5. **Upload** → die Google-**JSON-Datei** aus deinen Downloads hochladen, ebenfalls ganz oben.
6. **New File** → Name: `.env` → Inhalt:
   ```
   DISCORD_TOKEN=hier-dein-neuer-token
   DISCORD_CLIENT_ID=1569751133654753330
   ```
   → **Save**.
7. Unter **Startup** muss die Startdatei `index.js` sein, Node-Version 18 oder höher.
8. **Console** → **Start**. Nach dem `npm install` (1–2 Min) muss erscheinen:
   ```
   🔑 Google-Dienstkonto: bot@....iam.gserviceaccount.com
   🤖 Eingeloggt als ...
   ✅ 5 Slash-Commands für alle Server registriert
   ```
   → weiter mit **Schritt 4**.

## 3B. Bot starten mit Termux (nur Android-Tablet)

1. **F-Droid** von <https://f-droid.org> installieren, darin **Termux** installieren. Nicht die Termux-Version aus dem Play Store nehmen.
2. Termux öffnen und Zeile für Zeile eingeben:
   ```bash
   pkg update -y && pkg upgrade -y
   pkg install -y nodejs git nano
   termux-setup-storage
   git clone -b claude/discord-bot-sheet-commands-cgg4zl https://github.com/EdelLucas/Bot.git
   cd Bot
   cp ~/storage/downloads/*.json ./
   nano .env
   ```
   - Bei `termux-setup-storage` die Speicher-Berechtigung erlauben.
   - Ist das Repo privat, fragt `git` nach Benutzername und Passwort. Als Passwort einen GitHub-Token nehmen (GitHub → Settings → Developer settings → Personal access tokens).
3. In `nano` die zwei Zeilen von oben (Token und Client-ID) eintippen. Speichern mit **CTRL+O** und Enter, beenden mit **CTRL+X**. Die CTRL-Taste ist in der Leiste über der Tastatur.
4. Starten:
   ```bash
   npm install
   npm start
   ```
   Die Meldungen sollten wie bei 3A aussehen.
5. Benachrichtigung von Termux runterziehen → **Acquire wakelock**, damit Android den Bot nicht schlafen legt. Termux offen lassen. Beenden mit **CTRL+C**.

---

## 4. In Discord testen

In der Discord-App `/` tippen. Dann erscheinen die Befehle des Bots, einfach antippen und die Felder ausfüllen. Siehst du keine Befehle: Discord-App komplett schließen und neu öffnen, notfalls 5 Minuten warten.

### a) Server einrichten
| Schritt | Befehl | Erwartet |
|---|---|---|
| 1 | `/setup info` | Zeigt die Bot-E-Mail, Liste „nicht eingerichtet“ |
| 2 | `/setup sheet link:` *Link vom Blatt mit der Liste* | ✅ Liste verbunden, mit Anzeige der erkannten Spieler und Event-Spalten mit Beträgen |
| 3 | `/setup kanal kanal:` *#dein-ankündigungskanal* | ✅ Events werden ab jetzt in … angekündigt |

### b) Dich in der Liste verknüpfen
| 4 | `/id setzen spieler:` *deinen Namen tippen und auswählen* | ✅ @du ist jetzt **Name \| ID** |
|---|---|---|

### c) Test-Event (dauert 5 Minuten)
5. **Geh in einen Voice-Kanal.**
6. Schau auf die Uhr und nimm **die nächste volle Minute + 1**. Ist es z.B. 14:37, nimm `14:39`.
   ```
   /event ankuendigen art:Panel/plantage 10k start:14:39 call:#dein-voice dauer:3 min_minuten:1
   ```
   Bei `art` erscheinen die Spalten aus deiner Liste zur Auswahl. Für den Test nimmst du am besten eine günstige Spalte.
7. Bis zu 1 Minute nach der Startzeit: „▶️ … hat begonnen!“
8. `/event teilnehmer event:` *#1 wählen*: Du stehst drin, mit „→ dein Name“.
9. Im Call bleiben. Etwa 3 Minuten nach dem Start: „🏁 … ist beendet“.
10. In der Liste ist in deiner Zeile die Spalte **um 1 höher**, und „Auszahlung offen“ ist gestiegen.

### d) Auszahlungen
| 11 | `/auszahlung meine` | Deine Teilnahmen und dein offener Betrag |
|---|---|---|
| 12 | `/auszahlung eintragen spieler:` *du* `art:` *Spalte* `anzahl:-1` | Testeintrag wieder rückgängig gemacht |
| 13 | `/auszahlung offen` | Alle offenen Beträge |

`/auszahlung erledigt` und `/auszahlung sanktion` schreiben in die Spalten „ausgezahlt“ bzw. „Sanktionen“. Das testest du am besten erst mit einer Kopie der Liste.

Wenn das alles klappt, funktioniert der Bot. 🎉

---

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Bot ist in Discord offline | In der Konsole (Wispbyte/Termux) nach Fehlern schauen |
| `An invalid token was provided` | Token in `.env` falsch, z.B. mit Leerzeichen, Anführungszeichen oder alt. Neu kopieren |
| `Kein Google-Schlüssel gefunden` | JSON-Datei liegt nicht im Hauptordner (bei Termux: `ls` muss sie anzeigen) |
| `/setup sheet`: „Ich komme nicht an das Sheet ran“ | Sheet nicht mit der Bot-E-Mail als **Bearbeiter** geteilt, oder Google Sheets API nicht aktiviert |
| „keine Kopfzeile mit Event-Spalten gefunden“ | Link vom falschen Blatt. Oder die Spaltenköpfe enden nicht auf einen Betrag wie `50k` |
| Jemand wird „nicht in der Liste gefunden“ | Die Person macht `/id setzen` und wählt sich aus. Die Teilnahme wird automatisch nachgetragen |
| Keine `/`-Befehle zu sehen | Discord-App neu starten. Bot mit Scope `applications.commands` eingeladen? (Schritt 1.4) |
| „Startzeit liegt in der Vergangenheit“ | Eine spätere Uhrzeit nehmen. Die Zeitzone ist Europe/Berlin |
| Event startet nicht | 1–2 Min warten (der Bot prüft jede Minute). Kann der Bot den Voice-Kanal **sehen**? |
| Ankündigung kommt nicht | Bot braucht im Ankündigungskanal „Nachrichten senden“ und „Links einbetten“ |
| Im Call wird niemand gezählt | Bot braucht „Kanal ansehen“ für den Voice-Kanal |

Fehlermeldung unklar? Screenshot von der Konsole machen und schicken.
