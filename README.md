# TCG Collection Manager

**Version 1.11** — geplante nächste Schritte in [docs/ROADMAP.md](docs/ROADMAP.md).

Selbstgehostete Sammelkartenverwaltung im Stil von **cardcluster** — für **Yu-Gi-Oh!, Pokémon TCG, Magic: The Gathering, Riftbound und Disney Lorcana**.

Gedacht zum Selbsthosten (z. B. auf einer Synology NAS): **MariaDB** als Datenbank, **Docker** für Backend (REST-API) und Frontend (Web-App), Login-Pflicht, HTTPS-fähig.

## Features

- **5 Sammelkartenspiele** aus automatischem Katalog-Import: Yu-Gi-Oh! ([YGOPRODeck](https://ygoprodeck.com/api-guide/)), Pokémon TCG ([pokemontcg.io](https://pokemontcg.io/)), Magic: The Gathering ([Scryfall](https://scryfall.com/docs/api)), Riftbound ([riftcodex.com](https://riftcodex.com)), Disney Lorcana ([lorcanajson.org](https://lorcanajson.org)) — inkl. deutscher Kartennamen/-texte, soweit die Quelle sie führt
- **Delta-Import**: täglicher Katalog-Abgleich per Versions-Check + Inhalts-Hash, statt jedes Mal alles neu zu schreiben (cron-fähig)
- **Karten-Browser**: Suche über Name, Kartentext und Sammelnummer (inkl. Sprachkürzel-Wildcard), generische Filter je Spiel, Set-Übersicht mit Fortschrittsanzeige
- **Sammlungsverwaltung**: Menge, Zustand, Sprache, 1. Auflage, Lagerort, Kaufpreis, CSV-Import/-Export
- **Preis-Historie**: automatische Preis-Snapshots aus dem Import plus eigene manuelle Einträge, Verlaufsdiagramm im Frontend — echte Cardmarket-EUR-Preise für Magic/Pokémon/Lorcana/Riftbound (bei Lorcana/Riftbound über die freie `dotgg.gg`-API, teils inkl. Direktlink zur Cardmarket-Produktseite); Yu-Gi-Oh! bewusst TCGPlayer-USD statt Cardmarket, da nur so Preise je Rarität statt nur je Karte verfügbar sind (Details in [docs/DATENBANK.md](docs/DATENBANK.md)). Sammlungswert-Summen rechnen USD automatisch in EUR um.
- **Deck-Builder**: Zonen (Main/Extra/Side), Regeln je Spiel, Besitz-Abdeckung, Banlist-Check (Yu-Gi-Oh!), YDK-Import/-Export, PDF-Export
- **Foto-Scan**: Karte fotografieren (Handy-Kamera oder Webcam), Set-Code/Nummer per OCR erkennen und direkt zur Sammlung hinzufügen
- **Lokale Bild-Spiegelung**: Kartenbilder werden gespiegelt und selbst ausgeliefert statt extern verlinkt (kein Hotlinking)
- **Glossar**: Community-Jargon/Schlüsselwörter je Spiel als Nachschlageseite, inkl. Erklärung je Seltenheitsstufe, woran man sie am physischen Karton erkennt (Folie/Symbol/Rahmen)
- **Authentifizierung**: Login-Pflicht (JWT im httpOnly-Cookie), keine öffentliche Registrierung, Rollen `admin`/`viewer` (Viewer sieht alles, kann aber nichts ändern), Rate-Limiting gegen Brute-Force, Security-Header (Helmet), optionaler HTTPS-Zwang hinter einem Reverse Proxy
- **Mehrsprachig** (DE/EN) und **mobilfreundlich** (installierbar als Home-Bildschirm-App)
- Saubere REST-API — Frontend und Backend sind vollständig entkoppelt

## Architektur (Kurzfassung)

```
Browser ──► Frontend (React, nginx-Container, Port 8080)
                │  /api/* (Proxy)
                ▼
            Backend (Node.js/TypeScript + Fastify, Container, Port 3001)
                │  SQL (mysql2/knex)
                ▼
            MariaDB (eigenständig betrieben, z. B. auf der NAS)
                ▲
            Katalog-Importer (YGOPRODeck, Scryfall, pokemontcg.io, …)
```

Details: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md)

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `backend/` | REST-API (Node.js, TypeScript, Fastify, Knex-Migrationen) |
| `frontend/` | Web-App (React, TypeScript, Vite) |
| `docs/` | Architektur-, Datenbank-, API- und Deployment-Dokumentation |
| `docker-compose.yml` | Deployment-Konfiguration |

## Schnellstart (Entwicklung, lokal)

Voraussetzungen: Node.js ≥ 20, eine erreichbare MariaDB ≥ 10.5.

```bash
cp .env.example .env        # DB-Zugangsdaten eintragen
./start.sh                  # installiert Abhängigkeiten, migriert, startet Backend + Frontend
```

`start.sh` startet Backend (http://localhost:3001) und Frontend (http://localhost:5173) parallel und beendet beide sauber mit Strg+C. Danach im Dashboard je Spiel auf **„Katalog importieren"** klicken, oder direkt:

```bash
cd backend
npm run import:game -- yugioh       # Erstimport (bzw. Delta, falls schon importiert wurde)
```

Ersten Login-Nutzer anlegen (keine öffentliche Registrierung):

```bash
./create-user.sh <username> <passwort>              # Rolle "admin" (voller Zugriff)
./create-user.sh <username> <passwort> viewer        # Rolle "viewer" (nur Lesezugriff)
```

## Deployment (z. B. Synology NAS)

Siehe [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.md) — Kurzfassung:

```bash
cp .env.example .env        # DB-Zugangsdaten eintragen
docker compose up -d --build
# App: http://<host>:8080
```

Die Doku ist auf ein Synology-NAS-Setup zugeschnitten (inkl. bekannter Stolpersteine bei `rsync`, `docker-compose` und HTTPS via DSM-Reverse-Proxy + Let's Encrypt), das Docker-Compose-Setup selbst läuft aber auf jedem Docker-Host mit Zugriff auf eine MariaDB.

## Katalog aktuell halten (Delta-Import)

Ein erneuter Import lädt nicht jedes Mal den kompletten Katalog neu. Vor dem eigentlichen Abgleich wird zuerst per Versionscheck der Quelle geprüft, ob sich überhaupt etwas geändert hat; ist das nicht der Fall, bricht der Import sofort ab. Ändert sich etwas, wird jede Karte/jeder Print per Inhalts-Hash verglichen — geschrieben wird nur, was sich wirklich geändert hat.

```bash
cd backend
npm run import:game -- yugioh          # Delta-Import (Standard: Dashboard-Button macht dasselbe)
npm run import:game -- yugioh --force  # erzwingt kompletten Neuvergleich, ignoriert den Versionscheck
npm run import:delta                   # Delta-Import über alle aktiven Spiele — für Cron/Task Scheduler gedacht
```

Für automatische, regelmäßige Aktualisierung: `cron-delta-import.sh` als Cron-/Task-Scheduler-Job einrichten (Details in [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.md)).

## Login-Nutzer & Datenbank-Backup

Die App verlangt einen Login (keine öffentliche Registrierung). Beide Aufgaben laufen über schlanke Wrapper-Skripte im Projekt-Root, die direkt gegen die in `.env` konfigurierte Datenbank arbeiten:

```bash
./create-user.sh <username> <passwort> [admin|viewer]   # Nutzer anlegen bzw. Passwort zurücksetzen
./backup-db.sh                                          # DB sichern nach backups/*.sql.gz (gzip, mit Aufräumen alter Backups)
```

Details (Cron-Einrichtung, Restore, benötigtes DB-Client-Tool) in [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.md).

## Dokumentation

- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) — Systemaufbau, Technologie-Entscheidungen
- [docs/DATENBANK.md](docs/DATENBANK.md) — Schema, Multi-TCG-Konzept, ER-Diagramm
- [docs/API.md](docs/API.md) — alle REST-Endpunkte mit Beispielen
- [docs/DEPLOYMENT-SYNOLOGY.md](docs/DEPLOYMENT-SYNOLOGY.md) — Schritt-für-Schritt-Anleitung inkl. HTTPS
- [docs/ROADMAP.md](docs/ROADMAP.md) — Stand & geplante Ausbaustufen

## Mitwirken

Issues und Pull Requests sind willkommen — es gibt (bewusst, für ein Hobbyprojekt) keinen formalen Contribution-Prozess. Bei größeren Änderungen gerne vorher ein Issue aufmachen.

## Lizenz

[MIT](LICENSE)
