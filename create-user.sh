#!/usr/bin/env bash
# Legt einen Login-Nutzer an bzw. setzt bei bestehendem Benutzernamen dessen
# Passwort (und optional die Rolle) neu (Upsert) — dünner Wrapper um
# `npm run user:create` im backend/-Verzeichnis, der bei Bedarf zuerst die
# Abhängigkeiten installiert (analog start.sh). Schreibt direkt gegen die in
# .env konfigurierte Datenbank, braucht also kein laufendes Backend/Docker.
#
# Verwendung: ./create-user.sh <username> <passwort> [admin|viewer]
# Rolle weggelassen → "admin" bei Neuanlage; "viewer" = nur Lesezugriff,
# kann nichts an Sammlung/Decks/Katalog ändern.
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "Verwendung: $0 <username> <passwort> [admin|viewer]"
  exit 1
fi

if [ ! -f .env ]; then
  echo "⚠️  .env fehlt — siehe .env.example. Ohne Datenbank-Zugangsdaten kann kein Nutzer angelegt werden."
  exit 1
fi

if [ ! -d backend/node_modules ]; then
  echo "→ Installiere Backend-Abhängigkeiten …"
  (cd backend && npm install)
fi

(cd backend && npm run user:create -- "$1" "$2" "${3:-}")
