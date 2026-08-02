#!/usr/bin/env bash
# Läuft gegen die in .env konfigurierte Datenbank, braucht also kein
# laufendes Backend/Docker (wie create-user.sh). Gedacht für Quellen, die
# zwischendurch instabil sind (z. B. pokemontcg.io lieferte am 2026-08-01/02
# wiederholt HTTP 500 an wechselnden Stellen mitten im Kartenkatalog) — die
# eingebaute Retry-Logik je Anfrage (siehe backend/src/services/importers/
# util.ts) reicht bei einer länger anhaltenden Störung nicht immer aus, daher
# hier zusätzlich ein Retry auf ganzer Lauf-Ebene mit Wartezeit dazwischen.
#
# Verwendung: ./retry-import.sh [spielcode] [versuche] [wartezeit_sekunden]
#   ./retry-import.sh                 # Pokemon, 5 Versuche, 60 s Pause
#   ./retry-import.sh pokemon 10 120  # Pokemon, 10 Versuche, 120 s Pause
#   ./retry-import.sh magic 3         # Magic, 3 Versuche, Standard-Pause
set -uo pipefail
cd "$(dirname "$0")"

GAME="${1:-pokemon}"
ATTEMPTS="${2:-5}"
DELAY="${3:-60}"

if [ ! -f .env ]; then
  echo "FEHLER: .env fehlt — siehe .env.example. Ohne Datenbank-Zugangsdaten kein Import möglich."
  exit 1
fi

if [ ! -d backend/node_modules ]; then
  echo "→ Installiere Backend-Abhängigkeiten …"
  (cd backend && npm install)
fi

for i in $(seq 1 "$ATTEMPTS"); do
  echo "=== Versuch $i/$ATTEMPTS: Import '$GAME' (--force) ==="
  if (cd backend && npm run import:game -- "$GAME" --force); then
    echo "=== Erfolgreich (Versuch $i/$ATTEMPTS). ==="
    exit 0
  fi
  echo "=== Versuch $i/$ATTEMPTS fehlgeschlagen."
  if [ "$i" -lt "$ATTEMPTS" ]; then
    echo "    Warte ${DELAY}s vor dem nächsten Versuch …"
    sleep "$DELAY"
  fi
done

echo "FEHLER: Alle $ATTEMPTS Versuche fehlgeschlagen — Quelle vermutlich weiterhin gestört."
exit 1
