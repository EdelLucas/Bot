#!/usr/bin/env bash
# Holt die neueste Version aus GitHub und startet den Bot neu.
# Aufruf im Projektordner:  bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull
npm install --omit=dev
npm run deploy
sudo systemctl restart discord-bot
echo "✅ Aktualisiert. Logs:  journalctl -u discord-bot -f"
