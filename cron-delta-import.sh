#!/usr/bin/env bash
# Für den Produktivbetrieb auf der Synology: als Task-Scheduler-Job
# (z. B. täglich nachts) eintragen, um den Katalog automatisch aktuell zu
# halten. Ruft im laufenden Backend-Container den Delta-Import auf — lädt
# und schreibt nur, was sich seit dem letzten Lauf tatsächlich geändert hat.
#
# Synology Task Scheduler → Benutzerdefiniertes Skript:
#   bash /volume1/docker/tcg-collection/cron-delta-import.sh
set -euo pipefail
cd "$(dirname "$0")"

/usr/local/bin/docker-compose exec -T backend node dist/scripts/import-delta.js
