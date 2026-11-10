#!/usr/bin/env bash
# Richtet den Bot auf einem Ubuntu/Debian-Server ein und startet ihn als Dienst,
# der rund um die Uhr läuft und nach Abstürzen/Neustarts automatisch wieder startet.
# Aufruf im Projektordner:  bash deploy/setup.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="$(whoami)"
SERVICE=discord-bot

cd "$APP_DIR"
[ -f .env ] || { echo "❌ .env fehlt in $APP_DIR (cp .env.example .env und ausfüllen)"; exit 1; }
grep -q '^GOOGLE_CREDENTIALS_JSON=' .env || [ -f credentials.json ] || {
  echo "❌ credentials.json fehlt in $APP_DIR"; exit 1; }

# 1 GB Swap: kleine Gratis-Server haben nur ~1 GB RAM, npm install braucht kurz mehr
if [ -z "$(swapon --show)" ]; then
  echo "➕ Lege 1 GB Swap an"
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# Node.js 22 installieren, falls nicht vorhanden oder zu alt
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  echo "➕ Installiere Node.js 22"
  sudo apt-get update -y
  sudo apt-get install -y curl ca-certificates git
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✔ Node $(node -v)"

npm install --omit=dev
npm run deploy

echo "➕ Richte systemd-Dienst '$SERVICE' ein"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=Discord Auszahlungs-Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sleep 3
sudo systemctl --no-pager status $SERVICE | head -n 15
echo
echo "✅ Fertig. Logs ansehen:  journalctl -u $SERVICE -f"
