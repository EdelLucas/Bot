# Bot kostenlos 24/7 laufen lassen

Der Bot muss **dauerhaft laufen**. Sonst kann er Events nicht automatisch starten und den Voice-Call nicht erfassen. Dafür braucht man einen kleinen Server, der nie ausgeht. Dieser hier kostet nichts.

> **Ehrlich vorweg:** Alle seriösen Gratis-Server (Google, Oracle) wollen bei der Anmeldung eine **Kreditkarte zur Verifizierung**. Abgebucht wird nichts, solange man im Gratis-Rahmen bleibt, und diese Anleitung bleibt darin. Ganz ohne Karte geht es nur mit eigener Hardware (siehe [Option C](#option-c-eigener-rechner--raspberry-pi-ohne-kreditkarte)).

| Option | Kosten | Karte nötig | Bewertung |
|---|---|---|---|
| **A: Google Cloud e2-micro** | 0 € dauerhaft | ja (Verifizierung) | ⭐ **Empfohlen**: ihr habt für das Sheet sowieso schon ein Google-Cloud-Projekt |
| B: Oracle Cloud Always Free | 0 € dauerhaft | ja (Verifizierung) | Stärkerer Server, aber Oracle kann „untätige“ Gratis-Server stoppen |
| C: Eigener PC / Raspberry Pi | nur Strom | nein | Läuft nur, solange das Gerät an ist und Internet hat |

**Nicht empfehlenswert:** Render, Railway, Fly.io, Replit und ähnliche Plattformen. Ihre Gratis-Stufen schlafen nach kurzer Zeit ein, haben keine dauerhafte Festplatte (die Call-Erfassung ginge verloren) oder sind gar nicht mehr gratis. Von „Free Discord Bot Hosting“-Seiten ebenfalls abraten: Dort gebt ihr euren Bot-Token und den Google-Schlüssel an Unbekannte.

---

## Option A: Google Cloud e2-micro (empfohlen)

Google schenkt jedem Konto **eine kleine VM pro Monat dauerhaft**: e2-micro mit 2 vCPU (geteilt), 1 GB RAM und 30 GB Festplatte. Für diesen Bot reicht das locker.

### Schritt 1: Abrechnung aktivieren und Kostenbremse setzen
1. <https://console.cloud.google.com/> öffnen und **dasselbe Projekt** nehmen, in dem der Sheets-Dienstkonto-Schlüssel liegt.
2. **Abrechnung** → Rechnungskonto verknüpfen (Karte hinterlegen). Ohne Rechnungskonto lässt Google keine VM erstellen.
3. **Abrechnung → Budgets & Benachrichtigungen → Budget erstellen**: Betrag **1 €**, Warnungen bei 50 % / 100 %. Falls aus Versehen doch etwas Geld kostet, bekommt ihr sofort eine Mail.

### Schritt 2: VM erstellen
**Compute Engine → VM-Instanzen → Instanz erstellen** (beim ersten Mal die Compute-Engine-API aktivieren):

| Einstellung | Wert | Wichtig |
|---|---|---|
| Name | `discord-bot` | |
| Region | `us-central1` (Iowa), `us-west1` (Oregon) **oder** `us-east1` (South Carolina) | ⚠️ **Nur diese drei sind gratis.** Nicht Frankfurt o.ä. |
| Maschinentyp | Reihe **E2** → **e2-micro** | ⚠️ Nicht e2-small/medium |
| Bootlaufwerk → Ändern | **Ubuntu 24.04 LTS** (x86/64), Laufwerkstyp **Nichtflüchtiger Standardspeicher** („Standard persistent disk“), Größe **bis 30 GB** | ⚠️ Der Standard ist „Balanced“, der **kostet**. Auf „Standard“ umstellen! |
| Firewall | nichts anhaken | Der Bot braucht keine offenen Ports |
| Netzwerk | Standard lassen (sitzungsspezifische externe IP) | **Keine** statische IP reservieren, die kostet |

Dann **Erstellen**. Rechts wird oft ein Monatspreis angezeigt, der zieht den Gratis-Rabatt aber noch nicht ab. Entscheidend sind die drei ⚠️-Punkte.

### Schritt 3: Dateien auf den Server bringen
1. In der VM-Liste bei `discord-bot` auf **SSH** klicken. Es öffnet sich ein Terminal im Browser.
2. Code holen:
   ```bash
   git clone https://github.com/EdelLucas/Bot.git
   cd Bot
   ```
   - Ist das Repo **privat**, fragt git nach Benutzername und Passwort. Als Passwort einen **GitHub-Token** verwenden: GitHub → Settings → Developer settings → *Fine-grained tokens* → Zugriff nur auf dieses Repo, Berechtigung *Contents: Read-only*.
   - Solange der Code noch nicht in `main` gemergt ist: `git checkout claude/discord-bot-sheet-commands-cgg4zl`
3. **`.env` und `credentials.json` hochladen**: Im SSH-Fenster oben rechts auf **Datei hochladen** (⬆) klicken, beide Dateien auswählen. Sie landen im Home-Ordner, also verschieben:
   ```bash
   mv ~/.env ~/credentials.json ~/Bot/
   ```
   Alternativ `.env` direkt auf dem Server anlegen: `cp .env.example .env && nano .env` (Speichern mit `Strg+O`, Enter, `Strg+X`).

   > Diese beiden Dateien **niemals** ins GitHub-Repo hochladen. Sie stehen deshalb in `.gitignore`.

### Schritt 4: Einrichten und starten
```bash
bash deploy/setup.sh
```
Das Skript macht alles automatisch:
- legt 1 GB Swap an (zusätzlicher Speicher, weil die VM nur 1 GB RAM hat)
- installiert Node.js 22
- installiert die Pakete und registriert die Slash-Commands
- richtet den Bot als **Systemdienst** ein: Er startet beim Hochfahren automatisch und startet nach einem Absturz nach 10 Sekunden neu

Am Ende sollte `active (running)` und in den Logs `🤖 Eingeloggt als …` stehen. Fertig: Das Browserfenster kann zu, der Bot läuft weiter.

---

## Option B: Oracle Cloud Always Free

Mehr Leistung (ARM-Server mit mehreren GB RAM), aber mit einem Haken.

1. Konto auf <https://www.oracle.com/cloud/free/> anlegen (Karte zur Verifizierung). Die **Home-Region** kann man später nicht ändern, z.B. *Germany Central (Frankfurt)*.
2. **Compute → Instances → Create instance**
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere → VM.Standard.A1.Flex**, 1 OCPU und 6 GB RAM reichen. Es muss „Always Free-eligible“ dabeistehen.
   - SSH-Schlüssel: *Generate key pair* → **privaten Schlüssel herunterladen**
3. Verbinden: `ssh -i <schlüsseldatei> ubuntu@<öffentliche IP>`. Dateien hochladen: `scp -i <schlüssel> .env credentials.json ubuntu@<IP>:~/Bot/`
4. Ab hier wie bei Option A: `git clone …`, `cd Bot`, `bash deploy/setup.sh`

> **⚠️ Haken:** Oracle stoppt Gratis-Server, die über 7 Tage kaum CPU, Netzwerk und RAM nutzen. Ein Discord-Bot fällt da leicht drunter. Dann im Oracle-Portal einfach wieder **Start** drücken, der Dienst startet von selbst mit. Dauerhaft vermeiden lässt sich das durch ein Upgrade auf *Pay As You Go*. Gratis-Ressourcen bleiben dort gratis, aber dann unbedingt ein Budget-Alarm setzen. Wer gar kein Risiko will, nimmt Option A.

---

## Option C: Eigener Rechner / Raspberry Pi (ohne Kreditkarte)

Geht mit jedem Gerät, das durchgehend an ist: Raspberry Pi (ab Pi 3), alter Laptop, Heimserver.
- **Raspberry Pi OS, Ubuntu oder Debian:** genau wie oben: `git clone …`, `.env` und `credentials.json` reinlegen, `bash deploy/setup.sh`.
- **Windows-PC:** Node.js 22 von <https://nodejs.org> installieren und im Projektordner `npm install`, `npm run deploy` und `npm start` ausführen. Das Fenster muss offen bleiben, und der PC darf nicht in den Ruhezustand gehen.

Nachteil: Strom (ein Pi braucht ca. 3–5 W, also wenige Euro im Jahr). Und wenn Internet oder Strom weg ist, ist auch der Bot weg.

---

## Alltag: die wichtigsten Befehle (Option A, B, C mit Linux)

| Was | Befehl |
|---|---|
| Läuft der Bot? | `sudo systemctl status discord-bot` |
| Live-Logs ansehen (Beenden mit `Strg+C`) | `journalctl -u discord-bot -f` |
| Neu starten | `sudo systemctl restart discord-bot` |
| Stoppen | `sudo systemctl stop discord-bot` |
| **Neue Version aus GitHub einspielen** | `cd ~/Bot && bash deploy/update.sh` |
| `.env` geändert | `sudo systemctl restart discord-bot` |

> Nicht während eines laufenden Events neu starten, wenn es sich vermeiden lässt. Die Erfassung läuft zwar weiter (gespeichert in `data/tracking.json`), aber die Minuten, in denen der Bot aus war, zählen für niemanden.

## Probleme?

| Problem | Lösung |
|---|---|
| `❌ .env fehlt` / `credentials.json fehlt` | Dateien liegen nicht im Ordner `~/Bot`. Mit `ls -la ~/Bot` prüfen. |
| Logs: `Umgebungsvariable … fehlt` | `.env` unvollständig. `nano ~/Bot/.env`, dann neu starten. |
| Logs: `The caller does not have permission` | Sheet ist nicht mit der E-Mail-Adresse des Dienstkontos als **Bearbeiter** geteilt. |
| Logs: `An invalid token was provided` | `DISCORD_TOKEN` falsch oder im Developer Portal neu generiert. |
| Slash-Commands erscheinen nicht | `DISCORD_GUILD_ID` setzen und `npm run deploy` ausführen, Discord neu laden (`Strg+R`). |
| Bot zählt niemanden im Call | Bot braucht die Berechtigung „Kanal ansehen“ für den Voice-Kanal. |
| Google schickt Budget-Warnung | VM-Einstellungen prüfen: Region us-…, e2-micro, Standard-Festplatte, keine statische IP. |
