#!/usr/bin/env bash
# Sichert die MariaDB-Datenbank per mysqldump — für den manuellen Testlauf
# oder als Synology-Task-Scheduler-Job (analog cron-delta-import.sh).
# Liest die DB-Zugangsdaten aus der .env im Projekt-Root und läuft auf einem
# Rechner mit einem MySQL/MariaDB-Dump-Tool und Netzwerkzugriff auf
# DB_HOST:DB_PORT — i. d. R. NICHT im Backend-Container, das schlanke
# Alpine-Image bringt keinen DB-Client mit.
#
# Bevorzugt `mariadb-dump` (passender Client für eine MariaDB-Zieldatenbank)
# und fällt auf `mysqldump` zurück. Wichtig: das MySQL-9.x-Client-Paket von
# Oracle (z. B. via `brew install mysql-client`) versucht bei --routines
# unaufgefordert, Data-Masking-Policies zu dumpen — eine MySQL-Enterprise-
# Funktion, die MariaDB nicht kennt, was mit einem Privilegien-Fehler
# abbricht (Backup dann unvollständig!). Mit MariaDB als Ziel daher
# `mariadb-dump` installieren (macOS: `brew install mariadb`).
#
# Verwendung: ./backup-db.sh
# Optional per Env-Var: BACKUP_DIR (Default ./backups), BACKUP_RETENTION_DAYS
# (Default 14, 0 deaktiviert das automatische Aufräumen alter Backups).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "⚠️  .env fehlt — siehe .env.example."
  exit 1
fi
set -a
source .env
set +a

: "${DB_HOST:?DB_HOST fehlt in der .env}"
: "${DB_USER:?DB_USER fehlt in der .env}"
: "${DB_NAME:?DB_NAME fehlt in der .env}"
DB_PORT="${DB_PORT:-3306}"

if command -v mariadb-dump >/dev/null 2>&1; then
  DUMP_BIN=mariadb-dump
elif command -v mysqldump >/dev/null 2>&1; then
  DUMP_BIN=mysqldump
  echo "⚠️  mariadb-dump nicht gefunden, verwende mysqldump — bei MySQL-Enterprise-Client-Paketen (Oracle, Version ≥8.0.34) kann das fehlschlagen, siehe Kommentar oben. Empfehlung: 'brew install mariadb'."
else
  echo "✗ Weder mariadb-dump noch mysqldump gefunden. macOS: 'brew install mariadb'."
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "→ Sichere Datenbank \"$DB_NAME\" von $DB_HOST:$DB_PORT nach $OUT_FILE (via $DUMP_BIN) …"
MYSQL_PWD="$DB_PASSWORD" "$DUMP_BIN" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
  --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" | gzip > "$OUT_FILE"

echo "✓ Backup fertig: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d ' ')
  if [ "$DELETED" -gt 0 ]; then
    echo "→ $DELETED alte(s) Backup(s) älter als $RETENTION_DAYS Tage gelöscht."
  fi
fi
