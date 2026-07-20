#!/usr/bin/env bash
# Startet die lokale Entwicklungsumgebung: prüft .env, installiert fehlende
# Abhängigkeiten, führt ausstehende Migrationen aus und startet Backend
# (http://localhost:3001) und Frontend (http://localhost:5173) parallel.
#
# NICHT für den Produktivbetrieb auf der Synology gedacht — dort läuft
# `docker compose up -d --build` (siehe docs/DEPLOYMENT-SYNOLOGY.md).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  .env aus .env.example angelegt — bitte echte Datenbank-Zugangsdaten eintragen und das Skript erneut starten."
  exit 1
fi

if [ ! -d backend/node_modules ]; then
  echo "→ Installiere Backend-Abhängigkeiten …"
  (cd backend && npm install)
fi
if [ ! -d frontend/node_modules ]; then
  echo "→ Installiere Frontend-Abhängigkeiten …"
  (cd frontend && npm install)
fi

echo "→ Führe ausstehende Datenbank-Migrationen aus …"
(cd backend && npm run migrate)

cleanup() {
  echo ""
  echo "→ Stoppe Dev-Server …"
  kill 0
}
trap cleanup EXIT INT TERM

echo "→ Starte Backend (http://localhost:3001) und Frontend (http://localhost:5173) …"
echo "   Strg+C beendet beide Server."
(cd backend && npm run dev) &
(cd frontend && npm run dev) &
wait
